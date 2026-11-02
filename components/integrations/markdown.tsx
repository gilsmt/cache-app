"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { createStore } from "stan-js";
import { useCollectionsContext } from "@/components/session/collections";
import { useItemsActionsContext } from "@/components/session/items";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogPanel,
    DialogPopup,
    DialogTitle,
} from "@/components/ui/dialog";
import { ErrorMessage } from "@/components/ui/error-message";
import { type FILE_EXTENSION, fileOpen } from "@/lib/common/file";
import { createLogger } from "@/lib/common/logs/console/logger";
import {
    importMarkdownBatch,
    type MarkdownImportBatchData,
} from "@/lib/integrations/markdown/actions";
import {
    MARKDOWN_FILE_SIZE_SKIP_MESSAGE,
    MAX_MARKDOWN_CLIENT_BATCH_SIZE_BYTES,
    MAX_MARKDOWN_FILE_SIZE_BYTES,
    MAX_MARKDOWN_FILES_PER_BATCH,
} from "@/lib/integrations/markdown/quotas";
import type { MarkdownImportResult } from "@/lib/integrations/markdown/service";

const MARKDOWN_FILE_EXTENSIONS: FILE_EXTENSION[] = ["md", "markdown"];

type ImportStep = "choose" | "importing" | "done";

interface MarkdownFileEntry {
    markdown: string;
    relativePath: string;
}

interface SkippedMarkdownFile {
    message: string;
    relativePath: string;
}

interface MarkdownFileSelection {
    entries: MarkdownFileEntry[];
    skippedFiles: SkippedMarkdownFile[];
}

const TEXT_ENCODER = new TextEncoder();

const STEP_TITLES: Record<ImportStep, string> = {
    choose: "Import Markdown files",
    done: "Import complete",
    importing: "Importing…",
};

const STEP_DESCRIPTIONS: Record<ImportStep, string> = {
    choose: "Choose Markdown files or a folder to add them as notes. Importing the same file again creates another note. Nested folders create matching collections.",
    done: "Review what was created, skipped, or failed.",
    importing: "This can take a moment for large folders.",
};

const UNSUPPORTED_CONSTRUCTS: ReadonlyArray<{
    description: string;
    key: keyof MarkdownImportResult["unsupportedReport"];
    singular: string;
}> = [
    {
        description: "skipped (alt text preserved)",
        key: "imageCount",
        singular: "image",
    },
    {
        description: "skipped (text preserved)",
        key: "tableCount",
        singular: "table",
    },
    {
        description: "skipped",
        key: "htmlCount",
        singular: "raw HTML block",
    },
    {
        description: "rendered as text markers",
        key: "taskListCount",
        singular: "task-list item",
    },
];

const log = createLogger("library:markdown-import-dialog");

const {
    useStore: useMarkdownImportStore,
    actions: markdownImportStoreActions,
} = createStore({
    isOpen: false,
});

export function openMarkdownImportDialog() {
    markdownImportStoreActions.setIsOpen(true);
}

function isMarkdownFile(fileName: string): boolean {
    const lowerCaseName = fileName.toLowerCase();
    return MARKDOWN_FILE_EXTENSIONS.some((extension) =>
        lowerCaseName.endsWith(`.${extension}`)
    );
}

function createEmptyFileSelection(): MarkdownFileSelection {
    return { entries: [], skippedFiles: [] };
}

function pluralize(count: number, singular: string): string {
    return count === 1 ? singular : `${singular}s`;
}

function getFileRelativePath(file: File, stripRootSegment: boolean): string {
    const relativePath = file.webkitRelativePath || file.name;
    if (!stripRootSegment) {
        return relativePath;
    }
    return relativePath.split("/").slice(1).join("/") || file.name;
}

async function readMarkdownFileEntries(
    files: File[],
    stripRootSegment: boolean
): Promise<MarkdownFileSelection> {
    const entries: MarkdownFileEntry[] = [];
    const skippedFiles: SkippedMarkdownFile[] = [];
    for (const file of files) {
        if (!isMarkdownFile(file.name)) {
            continue;
        }
        const relativePath = getFileRelativePath(file, stripRootSegment);
        if (file.size > MAX_MARKDOWN_FILE_SIZE_BYTES) {
            skippedFiles.push({
                message: MARKDOWN_FILE_SIZE_SKIP_MESSAGE,
                relativePath,
            });
            continue;
        }
        const markdown = await file.text();
        if (markdown.trim().length === 0) {
            skippedFiles.push({
                message: "This file is empty.",
                relativePath,
            });
            continue;
        }
        entries.push({ markdown, relativePath });
    }
    return { entries, skippedFiles };
}

function buildImportBatches(
    entries: MarkdownFileEntry[]
): MarkdownFileEntry[][] {
    const batches: MarkdownFileEntry[][] = [];
    let currentBatch: MarkdownFileEntry[] = [];
    let currentBatchBytes = 0;
    for (const file of entries) {
        const fileBytes = TEXT_ENCODER.encode(file.markdown).length;
        if (
            currentBatch.length > 0 &&
            (currentBatch.length >= MAX_MARKDOWN_FILES_PER_BATCH ||
                currentBatchBytes + fileBytes >
                    MAX_MARKDOWN_CLIENT_BATCH_SIZE_BYTES)
        ) {
            batches.push(currentBatch);
            currentBatch = [];
            currentBatchBytes = 0;
        }
        currentBatch.push(file);
        currentBatchBytes += fileBytes;
    }
    if (currentBatch.length > 0) {
        batches.push(currentBatch);
    }
    return batches;
}

function isPickerAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === "AbortError";
}

function createImportResult(
    skippedFiles: SkippedMarkdownFile[]
): MarkdownImportResult {
    return {
        createdCount: 0,
        errors: [],
        failedCount: 0,
        items: [],
        skipped: [...skippedFiles],
        skippedCount: skippedFiles.length,
        unsupportedReport: {
            htmlCount: 0,
            imageCount: 0,
            tableCount: 0,
            taskListCount: 0,
        },
    };
}

function mergeImportResult(
    target: MarkdownImportResult,
    source: MarkdownImportResult
): void {
    target.createdCount += source.createdCount;
    target.skippedCount += source.skippedCount;
    target.failedCount += source.failedCount;
    target.items.push(...source.items);
    target.skipped.push(...source.skipped);
    target.errors.push(...source.errors);
    target.unsupportedReport.imageCount += source.unsupportedReport.imageCount;
    target.unsupportedReport.tableCount += source.unsupportedReport.tableCount;
    target.unsupportedReport.htmlCount += source.unsupportedReport.htmlCount;
    target.unsupportedReport.taskListCount +=
        source.unsupportedReport.taskListCount;
}

function addBatchFailure(
    result: MarkdownImportResult,
    files: MarkdownFileEntry[],
    message: string
): void {
    result.failedCount += files.length;
    for (const file of files) {
        result.errors.push({ message, relativePath: file.relativePath });
    }
}

export function MarkdownImportDialog() {
    const { isOpen, setIsOpen } = useMarkdownImportStore();

    const [step, setStep] = React.useState<ImportStep>("choose");
    const [fileSelection, setFileSelection] = React.useState(
        createEmptyFileSelection
    );
    const [result, setResult] = React.useState<MarkdownImportResult | null>(
        null
    );
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
    const { replaceCollections } = useCollectionsContext();
    const { mergeImportedItems } = useItemsActionsContext();
    const router = useRouter();
    // Guards the import completion update against a close/reset mid-import.
    const importSessionIdRef = React.useRef(0);
    const isSubmissionPendingRef = React.useRef(false);

    const resetDialog = useStableCallback(() => {
        importSessionIdRef.current += 1;
        isSubmissionPendingRef.current = false;
        setStep("choose");
        setFileSelection(createEmptyFileSelection());
        setResult(null);
        setErrorMessage(null);
    });

    const handleOpenChange = useStableCallback((open: boolean) => {
        setIsOpen(open);
        if (!open) {
            resetDialog();
        }
    });

    const handleEntriesReady = useStableCallback(
        (selection: MarkdownFileSelection) => {
            setFileSelection(selection);
            const { entries, skippedFiles } = selection;
            if (entries.length > 0) {
                setErrorMessage(null);
                return;
            }
            if (skippedFiles.length > 0) {
                setErrorMessage(
                    "None of the selected files can be imported. Check the file sizes and content."
                );
                return;
            }
            setErrorMessage(
                "No Markdown files found there. Choose a folder that contains .md or .markdown files."
            );
        }
    );

    const handlePickFiles = useStableCallback(async () => {
        setErrorMessage(null);
        try {
            const openedFiles = await fileOpen({
                description: "Markdown files",
                extensions: MARKDOWN_FILE_EXTENSIONS,
                multiple: true,
            });
            const selection = await readMarkdownFileEntries(openedFiles, false);
            handleEntriesReady(selection);
        } catch (error) {
            if (isPickerAbortError(error)) {
                return;
            }
            log.error("Failed to pick Markdown files", error);
            setErrorMessage("We couldn't open those files. Try again.");
        }
    });

    const handlePickFolder = useStableCallback(async () => {
        setErrorMessage(null);
        try {
            const { directoryOpen } = await import("browser-fs-access");
            const dirFiles = await directoryOpen({ recursive: true });
            const selection = await readMarkdownFileEntries(dirFiles, true);
            handleEntriesReady(selection);
        } catch (error) {
            if (isPickerAbortError(error)) {
                return;
            }
            log.error("Failed to pick Markdown folder", error);
            setErrorMessage("We couldn't open that folder. Try again.");
        }
    });

    const handleImport = useStableCallback(async () => {
        if (fileSelection.entries.length === 0) {
            return;
        }
        if (isSubmissionPendingRef.current) {
            return;
        }

        isSubmissionPendingRef.current = true;

        try {
            const sessionId = importSessionIdRef.current + 1;
            importSessionIdRef.current = sessionId;
            setStep("importing");

            const aggregatedResult = createImportResult(
                fileSelection.skippedFiles
            );

            let collectionsFromImport:
                | MarkdownImportBatchData["collections"]
                | null = null;

            for (const batch of buildImportBatches(fileSelection.entries)) {
                try {
                    const response = await importMarkdownBatch({
                        files: batch,
                    });

                    if (response.status === "SUCCESS") {
                        const { data } = response;
                        mergeImportResult(aggregatedResult, data);
                        collectionsFromImport = data.collections;
                    } else {
                        addBatchFailure(
                            aggregatedResult,
                            batch,
                            response.message
                        );
                    }
                } catch (err) {
                    log.error("Failed to import markdown batch", err);
                    addBatchFailure(
                        aggregatedResult,
                        batch,
                        "We couldn't import these files."
                    );
                }
            }

            if (aggregatedResult.items.length > 0) {
                mergeImportedItems(aggregatedResult.items);
            }
            if (collectionsFromImport !== null) {
                replaceCollections(collectionsFromImport);
            }
            router.refresh();

            if (importSessionIdRef.current === sessionId) {
                setResult(aggregatedResult);
                setStep("done");
            }
        } finally {
            isSubmissionPendingRef.current = false;
        }
    });

    const renderChooseStep = (
        <div className="flex flex-col gap-3 py-2">
            <Button onClick={handlePickFiles} size="sm">
                Choose files
            </Button>
            <Button onClick={handlePickFolder} size="sm" variant="outline">
                Choose folder
            </Button>
            {fileSelection.entries.length > 0 ? (
                <p className="text-muted-foreground text-sm">
                    {fileSelection.entries.length} Markdown file
                    {fileSelection.entries.length === 1 ? "" : "s"} ready
                    {fileSelection.skippedFiles.length > 0
                        ? ` · ${fileSelection.skippedFiles.length} skipped`
                        : ""}
                </p>
            ) : null}
            {errorMessage ? (
                <ErrorMessage className="pt-2">{errorMessage}</ErrorMessage>
            ) : null}
        </div>
    );

    const renderImportingStep = (
        <div className="flex items-center justify-center gap-2 py-6">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-muted-foreground text-sm">
                Importing {fileSelection.entries.length} file
                {fileSelection.entries.length === 1 ? "" : "s"}…
            </span>
        </div>
    );

    const renderDoneStep = result ? (
        <div className="flex flex-col gap-2 py-2 text-sm">
            <p>
                <strong>{result.createdCount}</strong> created
                {result.skippedCount > 0 && (
                    <span>
                        , <strong>{result.skippedCount}</strong> skipped
                    </span>
                )}
                {result.failedCount > 0 && (
                    <span>
                        , <strong>{result.failedCount}</strong> failed
                    </span>
                )}
            </p>
            {UNSUPPORTED_CONSTRUCTS.map((construct) => {
                const count = result.unsupportedReport[construct.key];
                if (count === 0) {
                    return null;
                }
                return (
                    <p className="text-muted-foreground" key={construct.key}>
                        {count} {pluralize(count, construct.singular)}{" "}
                        {construct.description}
                    </p>
                );
            })}
            {result.skipped.length > 0 && (
                <details className="mt-1">
                    <summary className="text-muted-foreground cursor-pointer text-xs">
                        {result.skipped.length}{" "}
                        {pluralize(result.skipped.length, "file")} left out
                    </summary>
                    <ul className="text-muted-foreground mt-1 max-h-32 list-none space-y-1 overflow-y-auto text-xs">
                        {result.skipped.map((skippedFile) => (
                            <li
                                className="list-none"
                                key={`${skippedFile.relativePath}-${skippedFile.message}`}
                            >
                                <code>{skippedFile.relativePath}</code>:{" "}
                                {skippedFile.message}
                            </li>
                        ))}
                    </ul>
                </details>
            )}
            {result.errors.length > 0 && (
                <details className="mt-1">
                    <summary className="text-destructive cursor-pointer text-xs">
                        {result.errors.length}{" "}
                        {pluralize(result.errors.length, "error")}
                    </summary>
                    <ul className="text-muted-foreground mt-1 max-h-32 list-none space-y-1 overflow-y-auto text-xs">
                        {result.errors.map((error) => (
                            <li
                                className="list-none"
                                key={`${error.relativePath}-${error.message}`}
                            >
                                <code>{error.relativePath}</code>:{" "}
                                {error.message}
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    ) : null;

    const renderFooter = () => {
        if (step === "done") {
            return (
                <DialogClose render={<Button size="sm" />}>Close</DialogClose>
            );
        }

        if (step === "importing") {
            return null;
        }

        if (fileSelection.entries.length === 0) {
            return null;
        }

        return (
            <Button onClick={handleImport} size="sm">
                Import {fileSelection.entries.length} file
                {fileSelection.entries.length === 1 ? "" : "s"}
            </Button>
        );
    };

    return (
        <Dialog onOpenChange={handleOpenChange} open={isOpen}>
            <DialogPopup>
                <DialogHeader>
                    <DialogTitle>{STEP_TITLES[step]}</DialogTitle>
                    <DialogDescription>
                        {STEP_DESCRIPTIONS[step]}
                    </DialogDescription>
                </DialogHeader>
                <DialogPanel>
                    {step === "choose" && renderChooseStep}
                    {step === "importing" && renderImportingStep}
                    {step === "done" && renderDoneStep}
                </DialogPanel>
                <DialogFooter>{renderFooter()}</DialogFooter>
            </DialogPopup>
        </Dialog>
    );
}
