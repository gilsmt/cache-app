"use server";

import * as z from "zod";
import { getSessionUserId } from "@/lib/auth/session";
import { listCollections } from "@/lib/collections/service";
import type { LibraryCollectionSummary } from "@/lib/collections/utils";
import { PRISMA_UNIQUE_CONSTRAINT_ERROR } from "@/lib/common/constants";
import { extractNamedErrorMessage } from "@/lib/common/error";
import { createLogger } from "@/lib/common/logs/console/logger";
import type { MarkdownImportResult } from "@/lib/integrations/markdown/service";
import {
    createMarkdownImportRecord,
    getMarkdownImport,
    importMarkdownFiles,
    listMarkdownImportRecords,
} from "@/lib/integrations/markdown/service";
import { scheduleSmartCollections } from "@/lib/intelligence/schedule";
import { Prisma } from "@/prisma/client/client";

const log = createLogger("integrations:markdown:actions");

const MAX_FILES_PER_BATCH = 100;
const MAX_BATCH_SIZE_BYTES = 5_000_000;
const MAX_IMPORT_NAME_LENGTH = 128;

const DUPLICATE_IMPORT_NAME_MESSAGE =
    "An import with this name already exists. Pick the existing import instead.";

const CreateImportSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, "Enter a name for this import.")
        .max(
            MAX_IMPORT_NAME_LENGTH,
            `Import names can be up to ${MAX_IMPORT_NAME_LENGTH} characters.`
        ),
});

const ImportBatchFileSchema = z.object({
    markdown: z.string(),
    relativePath: z.string().trim().min(1, "File path is required."),
});

const ImportBatchSchema = z.object({
    files: z
        .array(ImportBatchFileSchema)
        .min(1, "Select at least one file to import.")
        .max(
            MAX_FILES_PER_BATCH,
            `You can import up to ${MAX_FILES_PER_BATCH} files at a time.`
        ),
    importId: z.string().trim().min(1),
});

type MarkdownActionResult<T> =
    | { data: T; status: "SUCCESS" }
    | {
          message: string;
          status: "ERROR" | "INVALID" | "UNAUTHORIZED" | "NOT_FOUND";
      };

export type MarkdownImportBatchData = MarkdownImportResult & {
    collections: LibraryCollectionSummary[];
};

export async function createMarkdownImport(input: {
    name: string;
}): Promise<MarkdownActionResult<{ id: string }>> {
    const parsed = CreateImportSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message:
                parsed.error.issues[0]?.message ??
                "We couldn't create this import.",
            status: "INVALID",
        };
    }

    const userId = await getSessionUserId();
    if (!userId) {
        return {
            message: "Sign in again to import Markdown files.",
            status: "UNAUTHORIZED",
        };
    }

    try {
        const record = await createMarkdownImportRecord({
            name: parsed.data.name,
            userId,
        });
        return { data: record, status: "SUCCESS" };
    } catch (error) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === PRISMA_UNIQUE_CONSTRAINT_ERROR
        ) {
            return {
                message: DUPLICATE_IMPORT_NAME_MESSAGE,
                status: "ERROR",
            };
        }
        const { message } = extractNamedErrorMessage(error);
        log.error("Failed to create Markdown import", {
            error,
            name: parsed.data.name,
        });
        return {
            message: message || "We couldn't create this import.",
            status: "ERROR",
        };
    }
}

export async function listMarkdownImports(): Promise<
    MarkdownActionResult<Array<{ id: string; name: string; createdAt: Date }>>
> {
    const userId = await getSessionUserId();
    if (!userId) {
        return {
            message: "Sign in again to view your imports.",
            status: "UNAUTHORIZED",
        };
    }

    try {
        const records = await listMarkdownImportRecords(userId);
        return { data: records, status: "SUCCESS" };
    } catch (error) {
        log.error("Failed to list Markdown imports", error);
        return {
            message: "We couldn't load your imports.",
            status: "ERROR",
        };
    }
}

export async function importMarkdownBatch(input: {
    files: Array<{ markdown: string; relativePath: string }>;
    importId: string;
}): Promise<MarkdownActionResult<MarkdownImportBatchData>> {
    const parsed = ImportBatchSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message:
                parsed.error.issues[0]?.message ??
                "We couldn't process this batch.",
            status: "INVALID",
        };
    }

    const userId = await getSessionUserId();
    if (!userId) {
        return {
            message: "Sign in again to import Markdown files.",
            status: "UNAUTHORIZED",
        };
    }

    const totalBytes = parsed.data.files.reduce(
        (sum, file) => sum + new TextEncoder().encode(file.markdown).length,
        0
    );
    if (totalBytes > MAX_BATCH_SIZE_BYTES) {
        return {
            message: `Batch is too large. Total size must be under ${(MAX_BATCH_SIZE_BYTES / 1_000_000).toFixed(0)} MB.`,
            status: "INVALID",
        };
    }

    try {
        const markdownImport = await getMarkdownImport(
            parsed.data.importId,
            userId
        );
        if (!markdownImport) {
            return {
                message: "This import namespace no longer exists.",
                status: "NOT_FOUND",
            };
        }

        const { smartCollectionItemIds, ...result } = await importMarkdownFiles(
            {
                files: parsed.data.files,
                importId: parsed.data.importId,
                userId,
            }
        );
        scheduleSmartCollections(userId, smartCollectionItemIds);
        const collections = await listCollections({ userId });

        return {
            data: { ...result, collections },
            status: "SUCCESS",
        };
    } catch (error) {
        const { message } = extractNamedErrorMessage(error);
        log.error("Failed to import Markdown batch", {
            error,
            fileCount: parsed.data.files.length,
            importId: parsed.data.importId,
        });
        return {
            message: message || "We couldn't import these files.",
            status: "ERROR",
        };
    }
}
