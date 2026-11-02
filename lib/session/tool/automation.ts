import { tool } from "ai";
import * as z from "zod";
import { isHttpUrl } from "@/lib/common/url";
import { AUTOMATION_ITEM_PAGE_LIMIT_MAX } from "../automations/constants";
import type { AutomationAgentSource } from "./web";

const EmptyAutomationToolInputSchema = z.object({});
const AUTOMATION_ITEM_CURSOR_PREFIX = "cursor-v2.";
const AUTOMATION_ITEM_CURSOR_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/u;
const AUTOMATION_ITEM_CURSOR_MAX_LENGTH = 512;
const AUTOMATION_ITEM_CURSOR_KEY_CONTEXT = "cache:automation-item-cursor:v2";

const AutomationPayloadItemsInputSchema = z.object({
    cursor: z
        .string()
        .trim()
        .min(1)
        .max(AUTOMATION_ITEM_CURSOR_MAX_LENGTH)
        .describe("Opaque nextCursor token from the previous page.")
        .optional(),
    limit: z.int().min(1).max(AUTOMATION_ITEM_PAGE_LIMIT_MAX).optional(),
    search: z.string().trim().max(200).optional(),
});

/**
 * The saved-content payload tools exposed to automation agents. Definitions
 * stay import-safe; the payload implementations load lazily because they are
 * workflow steps and touch the database.
 */
export function createAutomationPayloadTools(args: {
    runId: string;
    state: { sources: AutomationAgentSource[] };
}) {
    const tools = {
        getAutomationPayloadSummary: tool({
            description:
                "Return the total size and scope of the saved-content payload available to this automation run.",
            execute: async () => {
                const { getAutomationPayloadSummary } = await import(
                    "../automations/payload"
                );
                return await getAutomationPayloadSummary({
                    runId: args.runId,
                });
            },
            inputSchema: EmptyAutomationToolInputSchema,
        }),
        listAutomationPayloadItems: tool({
            description:
                "Page through saved items available to this automation run. Results omit internal library item IDs and include saved URLs for inline Markdown links. Use nextCursor only to fetch the next page; never display it. Use this before writing the final summary.",
            execute: async (input) => {
                const cursor =
                    input.cursor === undefined
                        ? undefined
                        : await decodeAutomationItemCursor(input.cursor);
                if (input.cursor !== undefined && cursor === undefined) {
                    return {
                        error: "invalid_cursor",
                        items: [],
                        nextCursor: null,
                        truncated: false,
                    };
                }

                const { listAutomationPayloadItems } = await import(
                    "../automations/payload"
                );
                const result = await listAutomationPayloadItems({
                    cursor,
                    limit: input.limit,
                    runId: args.runId,
                    search: input.search,
                });
                type AutomationItemReference = Omit<
                    (typeof result.items)[number],
                    "id"
                >;
                const items: AutomationItemReference[] = [];
                for (const item of result.items) {
                    const { id, ...reference } = item;
                    if (isHttpUrl(item.url)) {
                        args.state.sources.push({
                            id,
                            title: item.caption?.trim() || item.url,
                            type: "library_item",
                            url: item.url,
                        });
                    }
                    items.push(reference);
                }

                return {
                    items,
                    nextCursor:
                        result.nextCursor === null
                            ? null
                            : await encodeAutomationItemCursor(
                                  result.nextCursor
                              ),
                    truncated: result.truncated,
                };
            },
            inputSchema: AutomationPayloadItemsInputSchema,
        }),
    };

    return tools;
}

async function encodeAutomationItemCursor(itemId: string): Promise<string> {
    const { encrypt } = await import("@/lib/common/security/encryption");
    const key = await getAutomationItemCursorKey();
    const { encrypted } = encrypt(itemId, key);
    return `${AUTOMATION_ITEM_CURSOR_PREFIX}${Buffer.from(encrypted).toString(
        "base64url"
    )}`;
}

async function decodeAutomationItemCursor(
    value: string
): Promise<string | undefined> {
    if (!value.startsWith(AUTOMATION_ITEM_CURSOR_PREFIX)) {
        return undefined;
    }

    const encryptedToken = value.slice(AUTOMATION_ITEM_CURSOR_PREFIX.length);
    if (!AUTOMATION_ITEM_CURSOR_TOKEN_PATTERN.test(encryptedToken)) {
        return undefined;
    }

    const encryptedValue = Buffer.from(encryptedToken, "base64url").toString(
        "utf8"
    );
    if (Buffer.from(encryptedValue).toString("base64url") !== encryptedToken) {
        return undefined;
    }

    const { decrypt, EncryptionError } = await import(
        "@/lib/common/security/encryption"
    );
    try {
        const key = await getAutomationItemCursorKey();
        return decrypt(encryptedValue, key).decrypted;
    } catch (error) {
        if (EncryptionError.isInstance(error)) {
            return undefined;
        }
        throw error;
    }
}

async function getAutomationItemCursorKey(): Promise<Buffer> {
    const { createHash } = await import("node:crypto");
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) {
        throw new Error(
            "Missing required environment variable: BETTER_AUTH_SECRET"
        );
    }

    return createHash("sha256")
        .update(AUTOMATION_ITEM_CURSOR_KEY_CONTEXT)
        .update("\0")
        .update(secret)
        .digest();
}
