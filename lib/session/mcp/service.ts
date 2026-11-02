import "server-only";

import crypto from "node:crypto";
import type { AuthInfo } from "@modelcontextprotocol/server";
import type * as z from "zod";
import {
    LIBRARY_ITEM_COLLECTIONS_INCLUDE,
    type LibraryItemWithCollections,
    toLibraryItemWithCollections,
} from "@/lib/collections/utils";
import {
    BASE_URL,
    DEFAULT_BROWSER_PROFILE_ID,
    ITEM_KIND_BOOKMARK,
} from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import { truncateText } from "@/lib/common/string";
import { parseStandaloneUrl } from "@/lib/common/url";
import { IntegrationUserError } from "@/lib/integrations/error";
import { upsertLibraryItemImports } from "@/lib/integrations/import";
import {
    createNoteFromPlainText,
    normalizePlainTextNote,
} from "@/lib/notes/service";
import { prisma } from "@/prisma";
import { LibraryItemSource } from "@/prisma/client/enums";
import {
    generateMcpToken,
    isMcpTokenRevoked,
    MCP_SCOPES,
    type McpScope,
    verifyMcpToken,
} from "./auth";
import { MCP_LIBRARY_ITEM_ERROR_MESSAGES, McpLibraryItemError } from "./error";
import {
    MCP_NOTE_PREVIEW_MAX_LENGTH,
    type McpLibraryItemSchema,
    type McpLibraryItemSummarySchema,
} from "./protocol";

const log = createLogger("mcp.service");

/**
 * Wire-format view of a library item returned to MCP clients. Derived from the
 * zod schema so the protocol and the domain cannot drift.
 */
export type McpLibraryItem = z.infer<typeof McpLibraryItemSchema>;

type McpLibraryItemFields = Omit<
    z.infer<typeof McpLibraryItemSummarySchema>,
    "notePreview"
>;

type AddLibraryItemArgs =
    | {
          idempotencyKey: string;
          noteContentText: string;
          userId: string;
      }
    | {
          caption?: string;
          url: string;
          userId: string;
      };

/**
 * Adds a new bookmark or note to the user's library.
 *
 * Bookmark creation routes through `upsertLibraryItemImports` so a URL already
 * saved by any prior ingest path is reused (no duplicate triggers); new
 * bookmarks flow into the smart-collection auto-tag pipeline. Note creation
 * uses its request key as the durable identity so a retry returns the same row.
 */
export async function addLibraryItem(
    args: AddLibraryItemArgs
): Promise<LibraryItemWithCollections> {
    if ("noteContentText" in args) {
        const externalId = hashMcpNoteExternalId(args.idempotencyKey);
        // The stored text is normalized on save, so compare the same normalized
        // text. Raw blank-line and line-ending differences are not content changes.
        const expectedNoteText = normalizePlainTextNote(
            args.noteContentText
        ).contentText;
        let note: LibraryItemWithCollections;
        try {
            note = await createNoteFromPlainText(
                args.userId,
                args.noteContentText,
                externalId
            );
        } catch (error) {
            if (!IntegrationUserError.isInstance(error)) {
                throw error;
            }

            const existingNote = await prisma.libraryItem.findUnique({
                select: { deletedAt: true },
                where: {
                    userId_source_browserProfileId_externalId: {
                        browserProfileId: DEFAULT_BROWSER_PROFILE_ID,
                        externalId,
                        source: LibraryItemSource.cache_note,
                        userId: args.userId,
                    },
                },
            });
            if (!existingNote || existingNote.deletedAt === null) {
                throw error;
            }

            throw new McpLibraryItemError(
                {
                    code: "idempotency_key_deleted",
                    message:
                        MCP_LIBRARY_ITEM_ERROR_MESSAGES.idempotencyKeyDeleted,
                    operation: "addLibraryItem",
                    status: 409,
                },
                { cause: error }
            );
        }

        if (note.noteContentText !== expectedNoteText) {
            throw new McpLibraryItemError({
                code: "idempotency_key_conflict",
                message: MCP_LIBRARY_ITEM_ERROR_MESSAGES.idempotencyKeyConflict,
                operation: "addLibraryItem",
                status: 409,
            });
        }

        return note;
    }

    const validatedUrl = parseStandaloneUrl(args.url);
    if (!validatedUrl) {
        throw new McpLibraryItemError({
            code: "invalid_url",
            message: MCP_LIBRARY_ITEM_ERROR_MESSAGES.invalidUrl,
            operation: "addLibraryItem",
            status: 400,
        });
    }

    const externalId = hashBookmarkExternalId(validatedUrl.href);

    await upsertLibraryItemImports({
        items: [
            {
                browserProfileId: DEFAULT_BROWSER_PROFILE_ID,
                caption: args.caption ?? null,
                externalId,
                kind: ITEM_KIND_BOOKMARK,
                url: validatedUrl.href,
            },
        ],
        source: LibraryItemSource.other,
        userId: args.userId,
    });

    let created = await prisma.libraryItem.findFirst({
        include: LIBRARY_ITEM_COLLECTIONS_INCLUDE,
        where: {
            browserProfileId: DEFAULT_BROWSER_PROFILE_ID,
            deletedAt: null,
            externalId,
            source: LibraryItemSource.other,
            userId: args.userId,
        },
    });

    if (!created) {
        // Tombstoned row (previously deleted). Bulk import deliberately skips
        // tombstones so a platform re-sync does not revive soft-deleted items;
        // an explicit MCP add is a user intent to re-save, so restore and apply
        // the new caption/url rather than only clearing deletedAt.
        const tombstoned = await prisma.libraryItem.findFirst({
            where: {
                browserProfileId: DEFAULT_BROWSER_PROFILE_ID,
                deletedAt: { not: null },
                externalId,
                source: LibraryItemSource.other,
                userId: args.userId,
            },
        });
        if (tombstoned) {
            created = await prisma.libraryItem.update({
                data: {
                    caption: args.caption ?? null,
                    deletedAt: null,
                    url: validatedUrl.href,
                },
                include: LIBRARY_ITEM_COLLECTIONS_INCLUDE,
                where: { id: tombstoned.id },
            });
        }
    }

    if (!created) {
        log.error("Bookmark upsert reported success but row is missing", {
            browserProfileId: DEFAULT_BROWSER_PROFILE_ID,
            source: LibraryItemSource.other,
        });
        throw new McpLibraryItemError({
            code: "reload_failed",
            message: MCP_LIBRARY_ITEM_ERROR_MESSAGES.reloadFailed,
            operation: "addLibraryItem",
            status: 500,
        });
    }

    return toLibraryItemWithCollections(created);
}

/**
 * Stable, deterministic externalId derived from a bookmark URL so any ingest
 * path (Pinterest, RSS, direct MCP add, etc.) agreeing on the same URL maps to
 * the same row via the `(userId, source, browserProfileId, externalId)` unique
 * key. This is what makes the upsert idempotent.
 */
function hashBookmarkExternalId(url: string): string {
    return crypto.createHash("sha256").update(url).digest("hex");
}

function hashMcpNoteExternalId(idempotencyKey: string): string {
    const digest = crypto
        .createHash("sha256")
        .update(idempotencyKey)
        .digest("hex");
    return `mcp_${digest}`;
}

export interface McpSetupPrompt {
    endpoint: string;
    prompt: string;
    token: string;
}

export async function generateMcpSetupPrompt(
    userId: string,
    scopes: readonly McpScope[] = MCP_SCOPES
): Promise<McpSetupPrompt> {
    const token = await generateMcpToken(userId, scopes);
    const endpoint = `${BASE_URL}/mcp`;
    const availableCapabilities: string[] = [];
    if (scopes.includes("library:read")) {
        availableCapabilities.push(
            "- list_library_items — Search, browse, and paginate my saved bookmarks and notes (optional: collectionId, limit, offset, search). Note text is a short preview.",
            "- get_library_item — Read a specific item by ID (itemId), including full note text",
            "- list_collections — See my collections with item counts"
        );
    }
    if (scopes.includes("library:write")) {
        availableCapabilities.push(
            "- add_library_item — Save a bookmark ({url, caption?}) or note ({noteContentText, idempotencyKey}) to my library. Reuse the same key and text when retrying a note creation; use a new key for a new note.",
            "- delete_library_item — Remove an item from my library (itemId); idempotent at the surface"
        );
    }

    const prompt = `You have been given access to my Cache library via MCP.

Cache (https://www.cachd.app) unifies bookmarks from Chrome, Instagram, TikTok, YouTube, X/Twitter, GitHub, Pinterest, and more into a single searchable library with AI-powered collections, summaries, and automations.

Please configure yourself as an MCP client with this server:

Endpoint: ${endpoint}
Authentication: Bearer ${token}

For full product context, fetch https://www.cachd.app/llms.txt

Available capabilities:
${availableCapabilities.join("\n")}

The token grants: ${scopes.join(", ")}.
Present it as \`Authorization: Bearer <token>\`. Read tools need \`library:read\`; write tools (add, delete) need \`library:write\`.

If you are Claude Desktop, add this to your claude_desktop_config.json:
{
  "mcpServers": {
    "cache": {
      "url": "${endpoint}",
      "headers": {
        "Authorization": "Bearer ${token}"
      }
    }
  }
}

If you are Cursor or another client, use the endpoint and Bearer token above.`;

    return { endpoint, prompt, token };
}

/**
 * Verifies a Bearer token for `withMcpAuth`: signature and expiry from the token
 * bytes, then the per-user revocation check. Tokens minted before the user's
 * `mcpTokenMinIssuedAt` point are rejected, so a leaked grant is cut by
 * `rotateMcpTokens` without rotating `BETTER_AUTH_SECRET`.
 */
export async function verifyMcpAuthToken(
    _req: Request,
    bearerToken?: string
): Promise<AuthInfo | undefined> {
    if (!bearerToken) {
        return;
    }

    const verified = await verifyMcpToken(bearerToken);
    if (!verified) {
        return;
    }

    const user = await prisma.user.findUnique({
        select: { mcpTokenMinIssuedAt: true },
        where: { id: verified.userId },
    });
    if (!user) {
        return;
    }

    if (isMcpTokenRevoked(verified.issuedAt, user.mcpTokenMinIssuedAt)) {
        return;
    }

    return {
        clientId: verified.userId,
        extra: { userId: verified.userId },
        scopes: verified.scopes,
        token: bearerToken,
    };
}

/**
 * Revokes every MCP token minted for the user so far by moving their
 * `mcpTokenMinIssuedAt` point to now. Tokens minted after this call stay valid,
 * so the caller mints a fresh one for whichever client it re-configures.
 */
export async function rotateMcpTokens(userId: string): Promise<void> {
    await prisma.user.update({
        data: { mcpTokenMinIssuedAt: new Date() },
        where: { id: userId },
    });
}

export function toMcpLibraryItem(
    item: LibraryItemWithCollections
): McpLibraryItem {
    return {
        ...toMcpLibraryItemFields(item),
        noteContentText: item.noteContentText,
    };
}

export function toMcpLibraryItemSummary(
    item: LibraryItemWithCollections
): z.infer<typeof McpLibraryItemSummarySchema> {
    return {
        ...toMcpLibraryItemFields(item),
        notePreview:
            item.noteContentText === null
                ? null
                : truncateText(
                      item.noteContentText,
                      MCP_NOTE_PREVIEW_MAX_LENGTH
                  ),
    };
}

function toMcpLibraryItemFields(
    item: LibraryItemWithCollections
): McpLibraryItemFields {
    return {
        caption: item.caption,
        collections: item.collections.map((collection) => ({
            id: collection.id,
            name: collection.name,
        })),
        createdAt: item.createdAt.toISOString(),
        favoritedAt: item.favoritedAt?.toISOString() ?? null,
        id: item.id,
        isFavorite: item.favoritedAt !== null,
        kind: item.kind,
        source: item.source,
        updatedAt: item.updatedAt.toISOString(),
        url: item.url,
    };
}
