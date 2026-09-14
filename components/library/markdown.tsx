"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { FileText, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { createStore } from "stan-js";
import { useCollectionsContext } from "@/components/library/collections";
import { useItemsContext } from "@/components/library/items";
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
import { Input } from "@/components/ui/input";
import type { LibraryCollectionSummary } from "@/lib/collections/utils";
import { type FILE_EXTENSION, fileOpen } from "@/lib/common/file";
import { createLogger } from "@/lib/common/logs/console/logger";
import {
    createMarkdownImport,
    importMarkdownBatch,
    listMarkdownImports,
} from "@/lib/integrations/markdown/actions";
import type { MarkdownImportResult } from "@/lib/integrations/markdown/service";

const MARKDOWN_FILE_EXTENSIONS: FILE_EXTENSION[] = ["md", "markdown"];
const MAX_FILE_SIZE_BYTES = 500_000;
const MAX_FILES_PER_BATCH = 100;
const MAX_BATCH_BYTES = 3_000_000;
const BATCH_IMPORT_FAILURE_MESSAGE = "We couldn't import these files.";
const FILE_SIZE_SKIP_MESSAGE = `Exceeds the ${(MAX_FILE_SIZE_BYTES / 1000).toFixed(0)} KB file size limit.`;
const EMPTY_FILE_SKIP_MESSAGE = "This file is empty.";

type ImportStep = "choose" | "create-new" | "pick-files" | "importing" | "done";

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
    "create-new": "New import",
    done: "Import complete",
    importing: "Importing…",
    "pick-files": "Select files",
};

const STEP_DESCRIPTIONS: Record<Exclude<ImportStep, "done">, string> = {
    choose: "Create a new import namespace or choose an existing one. Each namespace keeps imports from a folder separate.",
    "create-new":
        'Name this import. For example, "Obsidian vault", "Bear notes", or "Research papers".',
    importing: "",
    "pick-files":
        "Choose a folder or .md files to import. Nested folders create matching collections.",
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

function buildResultSummary(result: MarkdownImportResult): string {
    const parts: string[] = [];
    if (result.createdCount > 0) {
        parts.push(`${result.createdCount} created`);
    }
    if (result.updatedCount > 0) {
        parts.push(`${result.updatedCount} updated`);
    }
    if (result.skippedCount > 0) {
        parts.push(`${result.skippedCount} skipped`);
    }
    if (result.failedCount > 0) {
        parts.push(`${result.failedCount} failed`);
    }
    return parts.length > 0
        ? `Import finished: ${parts.join(", ")}.`
        : "Import finished with no changes.";
}

function getStepDescription(
    step: ImportStep,
    result: MarkdownImportResult | null
): string {
    if (step === "done") {
        return result ? buildResultSummary(result) : "";
    }
    return STEP_DESCRIPTIONS[step];
}

function isMarkdownFile(fileName: string): boolean {
    return MARKDOWN_FILE_EXTENSIONS.some((extension) =>
        fileName.endsWith(`.${extension}`)
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
        if (file.size > MAX_FILE_SIZE_BYTES) {
            skippedFiles.push({
                message: FILE_SIZE_SKIP_MESSAGE,
                relativePath,
            });
            continue;
        }
        const markdown = await file.text();
        if (markdown.trim().length === 0) {
            skippedFiles.push({
                message: EMPTY_FILE_SKIP_MESSAGE,
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
            (currentBatch.length >= MAX_FILES_PER_BATCH ||
                currentBatchBytes + fileBytes > MAX_BATCH_BYTES)
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
        updatedCount: 0,
    };
}

function mergeImportResult(
    target: MarkdownImportResult,
    source: MarkdownImportResult
): void {
    target.createdCount += source.createdCount;
    target.updatedCount += source.updatedCount;
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
    const [imports, setImports] = React.useState<
        Array<{ id: string; name: string; createdAt: Date }>
    >([]);
    const [selectedImportId, setSelectedImportId] = React.useState<
        string | null
    >(null);
    const [newImportName, setNewImportName] = React.useState("");
    const [fileSelection, setFileSelection] = React.useState(
        createEmptyFileSelection
    );
    const [result, setResult] = React.useState<MarkdownImportResult | null>(
        null
    );
    const [isLoading, startLoading] = React.useTransition();
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
    const { replaceCollections } = useCollectionsContext();
    const { mergeImportedItems: mergeLibraryItems } = useItemsContext();
    const router = useRouter();
    const importSessionIdRef = React.useRef(0);
    const isCreateSubmissionPendingRef = React.useRef(false);
    const isImportSubmissionPendingRef = React.useRef(false);

    const loadImports = useStableCallback(() => {
        startLoading(async () => {
            try {
                const response = await listMarkdownImports();
                if (response.status === "SUCCESS") {
                    setImports(response.data);
                    setErrorMessage(null);
                } else {
                    log.error("Failed to load imports", response);
                    setErrorMessage("We couldn't load previous imports.");
                }
            } catch (err) {
                log.error("Failed to load imports unexpectedly", err);
                setErrorMessage("We couldn't load previous imports.");
            }
        });
    });

    const resetFileSelection = useStableCallback(() => {
        setFileSelection(createEmptyFileSelection());
    });

    const resetDialog = useStableCallback(() => {
        importSessionIdRef.current += 1;
        isImportSubmissionPendingRef.current = false;
        isCreateSubmissionPendingRef.current = false;
        setStep("choose");
        setSelectedImportId(null);
        setNewImportName("");
        resetFileSelection();
        setResult(null);
        setErrorMessage(null);
    });

    const handleOpenChange = useStableCallback((open: boolean) => {
        setIsOpen(open);
        if (open) {
            loadImports();
        } else {
            resetDialog();
        }
    });

    const handleCreateNew = useStableCallback(() => {
        setErrorMessage(null);
        setStep("create-new");
    });

    const handleCreateAndSelectFiles = useStableCallback(() => {
        const trimmed = newImportName.trim();
        if (!trimmed) {
            setErrorMessage("Enter a name for this import.");
            return;
        }
        if (isCreateSubmissionPendingRef.current) {
            return;
        }

        setErrorMessage(null);
        isCreateSubmissionPendingRef.current = true;
        startLoading(async () => {
            try {
                const response = await createMarkdownImport({ name: trimmed });
                if (response.status === "SUCCESS") {
                    setSelectedImportId(response.data.id);
                    setImports((prev) => [
                        ...prev,
                        {
                            createdAt: new Date(),
                            id: response.data.id,
                            name: trimmed,
                        },
                    ]);
                    setStep("pick-files");
                } else {
                    setErrorMessage(response.message);
                }
            } catch (err) {
                log.error("Failed to create import", err);
                setErrorMessage("We couldn't create this import.");
            } finally {
                isCreateSubmissionPendingRef.current = false;
            }
        });
    });

    const handleSelectExisting = useStableCallback((id: string) => {
        setErrorMessage(null);
        setSelectedImportId(id);
        setStep("pick-files");
    });

    const handleEntriesReady = useStableCallback(
        (selection: MarkdownFileSelection) => {
            setFileSelection(selection);
            const { entries, skippedFiles } = selection;
            if (entries.length === 0) {
                setErrorMessage(
                    skippedFiles.length > 0
                        ? "None of the selected files can be imported. Check the file sizes and content."
                        : "No Markdown files found there. Choose a folder that contains .md or .markdown files."
                );
            }
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
        if (!selectedImportId || fileSelection.entries.length === 0) {
            return;
        }
        if (isImportSubmissionPendingRef.current) {
            return;
        }

        isImportSubmissionPendingRef.current = true;

        try {
            const sessionId = importSessionIdRef.current + 1;
            importSessionIdRef.current = sessionId;
            setStep("importing");

            const aggregatedResult = createImportResult(
                fileSelection.skippedFiles
            );

            let collectionsFromImport: LibraryCollectionSummary[] | null = null;

            for (const batch of buildImportBatches(fileSelection.entries)) {
                try {
                    const response = await importMarkdownBatch({
                        files: batch,
                        importId: selectedImportId,
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
                        BATCH_IMPORT_FAILURE_MESSAGE
                    );
                }
            }

            if (aggregatedResult.items.length > 0) {
                mergeLibraryItems(aggregatedResult.items);
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
            isImportSubmissionPendingRef.current = false;
        }
    });

    const handleNewImportKeyDown = useStableCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter") {
                handleCreateAndSelectFiles();
            }
        }
    );

    const handleNewImportChange = useStableCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            setNewImportName(e.target.value);
        }
    );

    const handleBack = useStableCallback(() => {
        if (step === "create-new" || step === "pick-files") {
            setStep("choose");
            resetFileSelection();
            setErrorMessage(null);
        }
    });

    const sourceCount = fileSelection.entries.length;
    const stepTitle = STEP_TITLES[step];
    const stepDescription = getStepDescription(step, result);

    const renderChooseStep = (
        <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1">
                {errorMessage ? (
                    <p className="px-1 py-4 text-center text-muted-foreground text-sm">
                        {errorMessage}
                    </p>
                ) : null}
                {!errorMessage && imports.length === 0 && !isLoading ? (
                    <p className="px-1 py-4 text-center text-muted-foreground text-sm">
                        No previous imports.
                    </p>
                ) : null}
                {isLoading ? (
                    <div className="flex items-center justify-center py-4">
                        <Loader2 className="size-4 animate-spin" />
                    </div>
                ) : null}
                {imports.map((imp) => (
                    <ImportItemButton
                        id={imp.id}
                        key={imp.id}
                        name={imp.name}
                        onSelect={handleSelectExisting}
                    />
                ))}
            </div>
            <div className="-mx-6 border-t" />
            <Button
                className="gap-2"
                onClick={handleCreateNew}
                size="sm"
                variant="ghost"
            >
                <Plus className="size-4" />
                New import
            </Button>
        </div>
    );

    const renderCreateNewStep = (
        <div className="flex flex-col gap-3 py-2">
            <Input
                onChange={handleNewImportChange}
                onKeyDown={handleNewImportKeyDown}
                placeholder='e.g. "Obsidian vault"'
                value={newImportName}
            />
            {errorMessage ? (
                <ErrorMessage className="pt-2">{errorMessage}</ErrorMessage>
            ) : null}
            <Button
                disabled={isLoading || !newImportName.trim()}
                isLoading={isLoading}
                onClick={handleCreateAndSelectFiles}
                size="sm"
            >
                Create and select files
            </Button>
        </div>
    );

    const renderPickFilesStep = (
        <div className="flex flex-col gap-3 py-2">
            <Button onClick={handlePickFiles} size="sm">
                Choose files
            </Button>
            <Button onClick={handlePickFolder} size="sm" variant="outline">
                Choose folder
            </Button>
            {errorMessage ? (
                <ErrorMessage className="pt-2">{errorMessage}</ErrorMessage>
            ) : null}
        </div>
    );

    const renderImportingStep = (
        <div className="flex items-center justify-center gap-2 py-6">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-muted-foreground text-sm">
                Importing {sourceCount} file
                {sourceCount === 1 ? "" : "s"}...
            </span>
        </div>
    );

    const renderDoneStep = result ? (
        <div className="flex flex-col gap-2 py-2 text-sm">
            <p>
                <strong>{result.createdCount}</strong> created
                {result.updatedCount > 0 ? (
                    <span>
                        , <strong>{result.updatedCount}</strong> updated
                    </span>
                ) : null}
                {result.skippedCount > 0 ? (
                    <span>
                        , <strong>{result.skippedCount}</strong> skipped
                    </span>
                ) : null}
                {result.failedCount > 0 ? (
                    <span>
                        , <strong>{result.failedCount}</strong> failed
                    </span>
                ) : null}
            </p>
            <UnsupportedConstructItems report={result.unsupportedReport} />
            {result.skipped.length > 0 ? (
                <details className="mt-1">
                    <summary className="cursor-pointer text-muted-foreground text-xs">
                        {result.skipped.length}{" "}
                        {pluralize(result.skipped.length, "file")} left out
                    </summary>
                    <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto text-muted-foreground text-xs">
                        {result.skipped.map((skippedFile) => (
                            <li
                                key={`${skippedFile.relativePath}-${skippedFile.message}`}
                            >
                                <code>{skippedFile.relativePath}</code>:{" "}
                                {skippedFile.message}
                            </li>
                        ))}
                    </ul>
                </details>
            ) : null}
            {result.errors.length > 0 ? (
                <details className="mt-1">
                    <summary className="cursor-pointer text-destructive text-xs">
                        {result.errors.length}{" "}
                        {pluralize(result.errors.length, "error")}
                    </summary>
                    <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto text-muted-foreground text-xs">
                        {result.errors.map((error) => (
                            <li key={`${error.relativePath}-${error.message}`}>
                                <code>{error.relativePath}</code>:{" "}
                                {error.message}
                            </li>
                        ))}
                    </ul>
                </details>
            ) : null}
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

        return (
            <>
                {step === "choose" ? null : (
                    <Button onClick={handleBack} size="sm" variant="ghost">
                        Back
                    </Button>
                )}
                {step === "pick-files" && fileSelection.entries.length > 0 ? (
                    <Button onClick={handleImport} size="sm">
                        Import {fileSelection.entries.length} file
                        {fileSelection.entries.length === 1 ? "" : "s"}
                    </Button>
                ) : null}
            </>
        );
    };

    return (
        <Dialog onOpenChange={handleOpenChange} open={isOpen}>
            <DialogPopup>
                <DialogHeader>
                    <DialogTitle>{stepTitle}</DialogTitle>
                    <DialogDescription>{stepDescription}</DialogDescription>
                </DialogHeader>
                <DialogPanel>
                    {step === "choose" && renderChooseStep}
                    {step === "create-new" && renderCreateNewStep}
                    {step === "pick-files" && renderPickFilesStep}
                    {step === "importing" && renderImportingStep}
                    {step === "done" && renderDoneStep}
                </DialogPanel>
                <DialogFooter>{renderFooter()}</DialogFooter>
            </DialogPopup>
        </Dialog>
    );
}

interface ImportItemButtonProps {
    id: string;
    name: string;
    onSelect: (id: string) => void;
}

function ImportItemButton({ id, name, onSelect }: ImportItemButtonProps) {
    const handleClick = useStableCallback(() => onSelect(id));

    return (
        <Button
            className="justify-start gap-2 text-left!"
            onClick={handleClick}
            size="sm"
            variant="ghost"
        >
            <FileText className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{name}</span>
        </Button>
    );
}

interface UnsupportedConstructItemsProps {
    report: MarkdownImportResult["unsupportedReport"];
}

function UnsupportedConstructItems({ report }: UnsupportedConstructItemsProps) {
    return UNSUPPORTED_CONSTRUCTS.map((construct) => {
        const count = report[construct.key];
        return count > 0 ? (
            <p className="text-muted-foreground" key={construct.key}>
                {count} {pluralize(count, construct.singular)}{" "}
                {construct.description}
            </p>
        ) : null;
    });
}
