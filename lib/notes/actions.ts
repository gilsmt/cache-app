"use server";

import * as z from "zod";
import { getSessionUserId } from "@/lib/auth/session";
import type {
    LibraryCollectionSummary,
    LibraryItemWithCollections,
} from "@/lib/collections/utils";
import { unique } from "@/lib/common/array";
import { MAX_COLLECTIONS_PER_ITEM } from "@/lib/common/constants";
import { extractNamedErrorMessage } from "@/lib/common/error";
import { createLogger } from "@/lib/common/logs/console/logger";
import { IntegrationUserError } from "@/lib/integrations/error";
import {
    createNote as createNoteService,
    normalizeNotePayload,
    updateNote as updateNoteService,
} from "./service";

const log = createLogger("notes:actions");

const NOTE_CONTENT_HTML_MAX_LENGTH = 100_000;

const CreateNoteInputSchema = z.object({
    collectionIds: z
        .array(z.string().trim().min(1))
        .max(MAX_COLLECTIONS_PER_ITEM),
    contentHtml: z.string().max(NOTE_CONTENT_HTML_MAX_LENGTH).optional(),
    contentState: z.unknown().optional(),
});

const UpdateNoteInputSchema = z.object({
    contentHtml: z.string().max(NOTE_CONTENT_HTML_MAX_LENGTH),
    contentState: z.unknown().optional(),
    itemId: z.string().trim().min(1),
});

export type NoteMutationResult =
    | {
          collectionSummaries: LibraryCollectionSummary[];
          item: LibraryItemWithCollections;
          status: "SUCCESS";
      }
    | {
          message: string;
          status: "ERROR" | "INVALID" | "NOT_FOUND" | "UNAUTHORIZED";
      };

export async function createNote(
    input: {
        collectionIds?: string[];
        contentHtml?: string;
        contentState?: unknown;
    } = {}
): Promise<NoteMutationResult> {
    const parsed = CreateNoteInputSchema.safeParse({
        collectionIds: input.collectionIds ?? [],
        contentHtml: input.contentHtml,
        contentState: input.contentState,
    });
    if (!parsed.success) {
        return {
            message:
                parsed.error.issues[0]?.message ??
                "We couldn't create this note.",
            status: "INVALID",
        };
    }

    const userId = await getSessionUserId();
    if (!userId) {
        return {
            message: "Sign in again to create notes.",
            status: "UNAUTHORIZED",
        };
    }

    const note = normalizeNotePayload(parsed.data);
    // The ids are trimmed by the schema, so the duplicates are removed after
    // the trim: " abc" and "abc" name the same collection.
    const collectionIds = unique(parsed.data.collectionIds);

    try {
        const result = await createNoteService(userId, note, collectionIds);
        return {
            collectionSummaries: result.collectionSummaries,
            item: result.item,
            status: "SUCCESS",
        };
    } catch (error) {
        const details = extractNamedErrorMessage(error);
        log.error("Unexpected note create failure", error);
        return {
            message:
                details.message || "We couldn't create this note right now.",
            status: "ERROR",
        };
    }
}

export async function updateNote(input: {
    contentHtml: string;
    contentState?: unknown;
    itemId: string;
}): Promise<NoteMutationResult> {
    const parsed = UpdateNoteInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message:
                parsed.error.issues[0]?.message ??
                "We couldn't save this note.",
            status: "INVALID",
        };
    }

    const userId = await getSessionUserId();
    if (!userId) {
        return {
            message: "Sign in again to save notes.",
            status: "UNAUTHORIZED",
        };
    }

    const note = normalizeNotePayload(parsed.data);

    try {
        const item = await updateNoteService(userId, parsed.data.itemId, note);
        return {
            collectionSummaries: [],
            item,
            status: "SUCCESS",
        };
    } catch (error) {
        const details = extractNamedErrorMessage(error);
        if (IntegrationUserError.isInstance(error) && error.data.resource) {
            return {
                message: details.message,
                status: "NOT_FOUND",
            };
        }

        log.error("Unexpected note update failure", error);
        return {
            message: "We couldn't save this note right now.",
            status: "ERROR",
        };
    }
}
