import "server-only";

import crypto from "node:crypto";
import type { AuthInfo } from "@modelcontextprotocol/server";
import type * as z from "zod";
import {
    LIBRARY_ITEM_COLLECTIONS_INCLUDE,
    type LibraryItemWithCollections,
    toLibraryItemWithCollections,
} from "@/lib/collections/utils";
import { BASE_URL, ITEM_KIND_BOOKMARK } from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import { parseStandaloneUrl } from "@/lib/common/url";
import { DEFAULT_BROWSER_PROFILE_ID } from "@/lib/integrations/browser-profiles";
import { IntegrationApiError } from "@/lib/integrations/error";
import { upsertLibraryItemImports } from "@/lib/integrations/import";
import {
    generateMcpToken,
    isMcpTokenRevoked,
    MCP_SCOPES,
    verifyMcpToken,
} from "@/lib/integrations/mcp/auth";
import type { McpLibraryItemSchema } from "@/lib/integrations/mcp/protocol";
import { createNoteFromPlainText } from "@/lib/integrations/notes/service";
import { prisma } from "@/prisma";
import { LibraryItemSource } from "@/prisma/client/enums";

const log = createLogger("mcp.service");

/**
 * Wire-format view of a library item returned to MCP clients. Derived from the
 * zod schema so the protocol and the domain cannot drift.
 */
export type McpLibraryItem = z.infer<typeof McpLibraryItemSchema>;

interface AddLibraryItemArgs {
    caption?: string;
    noteContentText?: string;
    url?: string;
    userId: string;
}

/**
 * Adds a new bookmark or note to the user's library.
 *
 * Exactly one of `noteContentText` or `url` must be provided. Supplying both
 * (or neither) raises `IntegrationApiError` with status 400. Bookmark creation
 * routes through `upsertLibraryItemImports` so a URL already saved by any
 * prior ingest path is reused (no duplicate triggers); new bookmarks flow into
 * the smart-collection auto-tag pipeline. Notes use the dedicated
 * `createNoteFromPlainText` path because their identity is content-derived,
 * not URL-derived.
 */
export async function addLibraryItem(
    args: AddLibraryItemArgs
): Promise<LibraryItemWithCollections> {
    if (args.noteContentText && args.url) {
        throw new IntegrationApiError({
            message:
                "Pass either `url` (for a bookmark) or `noteContentText` (for a note), not both.",
            operation: "addLibraryItem",
            status: 400,
        });
    }

    if (args.noteContentText) {
        return createNoteFromPlainText(args.userId, args.noteContentText);
    }

    if (!args.url) {
        throw new IntegrationApiError({
            message: "Either `url` or `noteContentText` is required.",
            operation: "addLibraryItem",
            status: 400,
        });
    }

    const validatedUrl = parseStandaloneUrl(args.url);
    if (!validatedUrl) {
        throw new IntegrationApiError({
            message: "The provided URL is not valid.",
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
        throw new IntegrationApiError({
            message: "Bookmark was saved but could not be reloaded.",
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

export interface McpSetupPrompt {
    endpoint: string;
    prompt: string;
    token: string;
}

export async function generateMcpSetupPrompt(
    userId: string
): Promise<McpSetupPrompt> {
    const token = await generateMcpToken(userId, MCP_SCOPES);
    const endpoint = `${BASE_URL}/mcp`;

    const prompt = `You have been given access to my Cache library via MCP.

Cache (https://www.cachd.app) unifies bookmarks from Chrome, Instagram, TikTok, YouTube, X/Twitter, GitHub, Pinterest, and more into a single searchable library with AI-powered collections, summaries, and review workflows.

Please configure yourself as an MCP client with this server:

Endpoint: ${endpoint}
Authentication: Bearer ${token}

For full product context, fetch https://www.cachd.app/llms.txt

Available capabilities:
- list_library_items — Search, browse, and paginate my saved bookmarks and notes (optional: collectionId, limit, offset, search)
- get_library_item — Read a specific item by ID (itemId)
- add_library_item — Save a new bookmark ({url, caption?}) or note ({noteContentText}) to my library. The two shapes are mutually exclusive.
- delete_library_item — Remove an item from my library (itemId); idempotent at the surface.
- list_collections — See my collections with item counts

Tools require the token to be presented as \`Authorization: Bearer <token>\`. Read tools need \`library:read\`; write tools (add, delete) need \`library:write\`.

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
        logRejectedMcpToken(verified.userId, "unknown_user");
        return;
    }

    if (isMcpTokenRevoked(verified.issuedAt, user.mcpTokenMinIssuedAt)) {
        logRejectedMcpToken(verified.userId, "revoked");
        return;
    }

    return {
        clientId: verified.userId,
        extra: { userId: verified.userId },
        scopes: verified.scopes,
        token: bearerToken,
    };
}

type McpTokenRejectionReason = "revoked" | "unknown_user";

/**
 * Records why a token was rejected so an operator can count and attribute
 * rejected MCP traffic after a leak. WARN because the production log stream
 * keeps WARN and above, and no aggregator reads it.
 */
function logRejectedMcpToken(
    userId: string,
    reason: McpTokenRejectionReason
): void {
    log.warn("MCP token rejected", { reason, userId });
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
        caption: item.caption,
        collections: item.collections.map((c) => ({
            id: c.id,
            name: c.name,
        })),
        createdAt: item.createdAt.toISOString(),
        favoritedAt: item.favoritedAt?.toISOString() ?? null,
        id: item.id,
        isFavorite: item.favoritedAt !== null,
        kind: item.kind,
        noteContentText: item.noteContentText,
        source: item.source,
        updatedAt: item.updatedAt.toISOString(),
        url: item.url,
    };
}
