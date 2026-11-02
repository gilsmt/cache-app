"use server";

import * as z from "zod";
import { isUnauthenticated, requireActionUserId } from "@/lib/auth/session";
import { listCollections } from "@/lib/collections/service";
import type { LibraryCollectionSummary } from "@/lib/collections/utils";
import { getValidationErrorMessage } from "@/lib/common/action";
import { extractNamedErrorMessage } from "@/lib/common/error";
import { createLogger } from "@/lib/common/logs/console/logger";
import {
    MAX_MARKDOWN_FILES_PER_BATCH,
    MAX_MARKDOWN_SERVER_BATCH_SIZE_BYTES,
} from "@/lib/integrations/markdown/quotas";
import type { MarkdownImportResult } from "@/lib/integrations/markdown/service";
import { importMarkdownFiles } from "@/lib/integrations/markdown/service";
import { scheduleSmartCollections } from "@/lib/session/collections/schedule";

const log = createLogger("integrations:markdown:actions");

const TEXT_ENCODER = new TextEncoder();

const ImportBatchFileSchema = z.object({
    markdown: z.string(),
    relativePath: z.string().trim().min(1, "File path is required."),
});

const ImportBatchSchema = z.object({
    files: z
        .array(ImportBatchFileSchema)
        .min(1, "Select at least one file to import.")
        .max(
            MAX_MARKDOWN_FILES_PER_BATCH,
            `You can import up to ${MAX_MARKDOWN_FILES_PER_BATCH} files at a time.`
        ),
});

type MarkdownActionResult<T> =
    | { data: T; status: "SUCCESS" }
    | {
          message: string;
          status: "ERROR" | "INVALID" | "UNAUTHORIZED";
      };

export type MarkdownImportBatchData = MarkdownImportResult & {
    collections: LibraryCollectionSummary[];
};

export async function importMarkdownBatch(input: {
    files: Array<{ markdown: string; relativePath: string }>;
}): Promise<MarkdownActionResult<MarkdownImportBatchData>> {
    const parsed = ImportBatchSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                "We couldn't process this batch."
            ),
            status: "INVALID",
        };
    }

    const actor = await requireActionUserId(
        "Sign in again to import Markdown files."
    );
    if (isUnauthenticated(actor)) {
        return actor;
    }

    const totalBytes = parsed.data.files.reduce(
        (sum, file) => sum + TEXT_ENCODER.encode(file.markdown).length,
        0
    );
    if (totalBytes > MAX_MARKDOWN_SERVER_BATCH_SIZE_BYTES) {
        return {
            message: `Batch is too large. Total size must be under ${(MAX_MARKDOWN_SERVER_BATCH_SIZE_BYTES / 1_000_000).toFixed(0)} MB.`,
            status: "INVALID",
        };
    }

    try {
        const { smartCollectionItemIds, ...result } = await importMarkdownFiles(
            {
                files: parsed.data.files,
                userId: actor.userId,
            }
        );
        scheduleSmartCollections(actor.userId, smartCollectionItemIds);
        const collections = await listCollections({ userId: actor.userId });

        return {
            data: { ...result, collections },
            status: "SUCCESS",
        };
    } catch (error) {
        const { message } = extractNamedErrorMessage(error);
        log.error("Failed to import Markdown batch", {
            error,
            fileCount: parsed.data.files.length,
        });
        return {
            message: message || "We couldn't import these files.",
            status: "ERROR",
        };
    }
}
