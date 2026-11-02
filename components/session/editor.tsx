"use client";

import { useIsoLayoutEffect } from "@base-ui/utils/useIsoLayoutEffect";
import { useMergedRefs } from "@base-ui/utils/useMergedRefs";
import { useRefWithInit } from "@base-ui/utils/useRefWithInit";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import {
    AriaLiveRegionExtension,
    FocusManagerExtension,
    HistoryAnnounceExtension,
    RovingTabIndexExtension,
} from "@lexical/a11y";
import {
    configExtension,
    defineExtension,
    type InitialEditorStateType,
} from "@lexical/extension";
import { HistoryExtension } from "@lexical/history";
import { $generateNodesFromDOM } from "@lexical/html";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { useLexicalFocusManagerRef } from "@lexical/react/useLexicalFocusManagerRef";
import { useLexicalIsTextContentEmpty } from "@lexical/react/useLexicalIsTextContentEmpty";
import { useLexicalRovingTabIndexRef } from "@lexical/react/useLexicalRovingTabIndexRef";
import {
    $createHeadingNode,
    $isHeadingNode,
    HeadingAnnounceExtension,
    RichTextExtension,
} from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { cn } from "cn";
import { T, useGT, Var } from "gt-next";
import {
    $createParagraphNode,
    $getRoot,
    $getSelection,
    $isRangeSelection,
    $isRootNode,
    COMMAND_PRIORITY_LOW,
    type EditorState,
    FORMAT_TEXT_COMMAND,
    type LexicalEditor,
    mergeRegister,
    PASTE_COMMAND,
    type PasteCommandType,
    type RangeSelection,
    SELECTION_CHANGE_COMMAND,
    type SerializedEditorState,
} from "lexical";
import {
    BoldIcon,
    CheckIcon,
    ChevronDownIcon,
    Copy,
    DownloadIcon,
    ExternalLinkIcon,
    FileTextIcon,
    ItalicIcon,
    type LucideIcon,
    MessageCircleIcon,
    StrikethroughIcon,
    UnderlineIcon,
} from "lucide-react";
import type * as React from "react";
import {
    type ComponentType,
    createContext,
    type ReactNode,
    type SVGProps,
    use,
    useEffect,
    useRef,
    useState,
    useTransition,
} from "react";
import { TextMorph } from "torph/react";
import {
    type AutosaveStatus,
    useAutosave,
} from "@/components/hooks/use-autosave";
import { useCopyToClipboard } from "@/components/hooks/use-copy-to-clipboard";
import { ItemCollectionsCombobox } from "@/components/session/collections";
import { useItemsStateContext } from "@/components/session/items";
import type {
    EditorDraft,
    EditorSaveHandler,
    SidePanelNote,
} from "@/components/session/side-panel";
import { Button } from "@/components/ui/button";
import {
    ClaudeIcon,
    CursorIcon,
    GoogleDocsIcon,
    NotionIcon,
    OpenAIIcon,
    V0Icon,
} from "@/components/ui/icons";
import {
    Menu,
    MenuItem,
    MenuPopup,
    MenuSeparator,
    MenuTrigger,
} from "@/components/ui/menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getOwnerDocument } from "@/lib/common/dom";
import { saveFile } from "@/lib/common/file";
import { getSystemControlKey } from "@/lib/common/keyboard";
import { createLogger } from "@/lib/common/logs/console/logger";
import { slugify } from "@/lib/common/string";
import { openExternalUrl, parseStandaloneUrl } from "@/lib/common/url";
import { sendNoteToNotion } from "@/lib/integrations/notion/actions";
import {
    convertNoteHtmlToMarkdown,
    extractNoteText,
    isSerializedEditorState,
    NOTE_EMPTY_HTML,
    normalizeHtml,
    serializeEditorStateToHtml,
} from "@/lib/notes/utils";

const EDITOR_NAMESPACE = "cache-library-note";
const EDITOR_READING_WORDS_PER_MINUTE = 250;
const EDITOR_WORD_SEPARATOR = /\s+/u;

const EDITOR_HISTORY_ANNOUNCE_UNDONE = "Undone";
const EDITOR_HISTORY_ANNOUNCE_REDONE = "Redone";

const EDITOR_HEADING_ANNOUNCE_CREATED = "Heading level %s";
const EDITOR_HEADING_ANNOUNCE_DESTROYED = "Heading level %s removed";

const EDITOR_NON_EMPTY_BLOCK_TAG_REGEX =
    /<(h[1-3]|p)>(?!(?:\s|<br\s*\/?>)*<\/\1>)[\s\S]*?<\/\1>/giu;

const EDITOR_THEME = {
    heading: {
        h1: "mb-3 mt-0 text-[2rem] font-semibold leading-tight tracking-tight",
        h2: "mb-3 mt-6 text-[1.5rem] font-semibold leading-tight tracking-tight",
        h3: "mb-2 mt-5 text-[1.2rem] font-semibold leading-tight tracking-tight",
    },
    paragraph: "my-0 min-h-[1.75rem] leading-7",
    text: {
        bold: "font-semibold",
        highlight: "rounded-sm bg-amber-200/90 px-0.5",
        italic: "italic",
        strikethrough: "line-through",
        underline: "underline",
    },
};

interface EditorFormatState {
    blockType: EditorBlockType;
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    underline: boolean;
}

interface EditorTextMetrics {
    characterCount: number;
    paragraphCount: number;
    plainText: string;
    readMinuteCount: number;
    wordCount: number;
}

interface EditorActionsContext {
    contentEditableRef: React.RefObject<HTMLDivElement | null>;
    onDraftChange: (draft: EditorDraft) => void;
    onUrlPaste: (url: string) => Promise<void> | void;
    shouldCreateBookmarkFromUrlPaste: () => boolean;
}

interface EditorDraftContext {
    contentHtml: string;
    isDirty: boolean;
    noteId: string | null;
    saveStatus: AutosaveStatus;
    textMetrics: EditorTextMetrics;
}

interface EditorExportProvider {
    createUrl: (plainText: string) => string;
    icon: ComponentType<SVGProps<SVGSVGElement>>;
    id:
        | "chatgpt"
        | "claude"
        | "codex"
        | "cursor"
        | "google-docs"
        | "t3-chat"
        | "v0";
}

type EditorBlockType = "h1" | "h2" | "h3" | "paragraph";

type EditorInlineFormat = Exclude<keyof EditorFormatState, "blockType">;

const log = createLogger("library:side");

const INITIAL_FORMAT_STATE: EditorFormatState = {
    blockType: "paragraph",
    bold: false,
    italic: false,
    strikethrough: false,
    underline: false,
};

const EDITOR_BLOCK_VALUES = [
    "paragraph",
    "h1",
    "h2",
    "h3",
] as const satisfies readonly EditorBlockType[];

const EDITOR_TEXT_FORMAT_OPTIONS = [
    {
        format: "bold",
        icon: BoldIcon,
    },
    {
        format: "italic",
        icon: ItalicIcon,
    },
    {
        format: "underline",
        icon: UnderlineIcon,
    },
    {
        format: "strikethrough",
        icon: StrikethroughIcon,
    },
] satisfies ReadonlyArray<{
    format: EditorInlineFormat;
    icon: LucideIcon;
}>;

const EXPORT_CONTENT_PROVIDERS: readonly EditorExportProvider[] = [
    {
        createUrl: (plainText) =>
            `https://chatgpt.com/?${new URLSearchParams({ hints: "search", prompt: plainText })}`,
        icon: OpenAIIcon,
        id: "chatgpt",
    },
    {
        createUrl: (plainText) =>
            `https://claude.ai/new?${new URLSearchParams({ q: plainText })}`,
        icon: ClaudeIcon,
        id: "claude",
    },
    {
        createUrl: (plainText) =>
            `https://cursor.com/link/prompt?${new URLSearchParams({ text: plainText })}`,
        icon: CursorIcon,
        id: "cursor",
    },
    {
        createUrl: (plainText) =>
            `codex://new?${new URLSearchParams({ prompt: plainText })}`,
        icon: OpenAIIcon,
        id: "codex",
    },
    {
        createUrl: (plainText) =>
            `https://t3.chat/new?${new URLSearchParams({ q: plainText })}`,
        icon: MessageCircleIcon,
        id: "t3-chat",
    },
    {
        createUrl: (plainText) =>
            `https://v0.app?${new URLSearchParams({ q: plainText })}`,
        icon: V0Icon,
        id: "v0",
    },
    {
        createUrl: () => "https://docs.new",
        icon: GoogleDocsIcon,
        id: "google-docs",
    },
];

const EDITOR_EXTENSION = defineExtension({
    dependencies: [
        RichTextExtension,
        HistoryExtension,
        configExtension(AriaLiveRegionExtension, {
            owner: null,
            politeness: "polite",
        }),
        configExtension(HistoryAnnounceExtension, {
            redone: EDITOR_HISTORY_ANNOUNCE_REDONE,
            undone: EDITOR_HISTORY_ANNOUNCE_UNDONE,
        }),
        configExtension(HeadingAnnounceExtension, {
            created: EDITOR_HEADING_ANNOUNCE_CREATED,
            destroyed: EDITOR_HEADING_ANNOUNCE_DESTROYED,
        }),
        RovingTabIndexExtension,
        FocusManagerExtension,
    ],
    name: EDITOR_NAMESPACE,
    namespace: EDITOR_NAMESPACE,
    onError(error: Error) {
        log.error("Unexpected editor error", error);
    },
    theme: EDITOR_THEME,
});

const EditorActionsContext = createContext<EditorActionsContext | null>(null);

function useEditorActionsContext(): EditorActionsContext {
    const context = use(EditorActionsContext);
    if (!context) {
        throw new Error("Editor components must be used inside <Editor>.");
    }
    return context;
}

const EditorDraftContext = createContext<EditorDraftContext | null>(null);

function useEditorDraftContext(): EditorDraftContext {
    const context = use(EditorDraftContext);
    if (!context) {
        throw new Error("Editor components must be used inside <Editor>.");
    }
    return context;
}

function normalizeDraft(draft: EditorDraft): EditorDraft {
    return {
        contentHtml: normalizeHtml(draft.contentHtml),
        contentState: draft.contentState,
    };
}

function editorDraftFromEditorState(
    contentState: SerializedEditorState
): EditorDraft {
    return normalizeDraft({
        contentHtml: serializeEditorStateToHtml(contentState),
        contentState,
    });
}

function editorDraftFromItem(note: SidePanelNote | null): EditorDraft {
    const contentState = isSerializedEditorState(note?.noteContentState)
        ? note.noteContentState
        : null;

    if (contentState) {
        return editorDraftFromEditorState(contentState);
    }

    return normalizeDraft({
        contentHtml: note?.noteContentHtml ?? NOTE_EMPTY_HTML,
        contentState: null,
    });
}

function getEditorTextMetrics(contentHtml: string): EditorTextMetrics {
    const plainText = extractNoteText(contentHtml);
    const matchedBlocks = contentHtml.match(EDITOR_NON_EMPTY_BLOCK_TAG_REGEX);
    const wordCount =
        plainText.length === 0
            ? 0
            : plainText.split(EDITOR_WORD_SEPARATOR).filter(Boolean).length;
    const paragraphCount =
        plainText.length === 0 ? 0 : Math.max(1, matchedBlocks?.length ?? 0);

    return {
        characterCount: plainText.length,
        paragraphCount,
        plainText,
        readMinuteCount: Math.ceil(wordCount / EDITOR_READING_WORDS_PER_MINUTE),
        wordCount,
    };
}

function haveDraftsChanged(left: EditorDraft, right: EditorDraft): boolean {
    return normalizeHtml(left.contentHtml) !== normalizeHtml(right.contentHtml);
}

function isDraftEmpty(draft: EditorDraft): boolean {
    return extractNoteText(draft.contentHtml).length === 0;
}

function shouldCloseWithoutSaving(
    currentDraft: EditorDraft,
    initialDraft: EditorDraft,
    hasPersistedNote: boolean
): boolean {
    if (!haveDraftsChanged(currentDraft, initialDraft)) {
        return true;
    }
    return !hasPersistedNote && isDraftEmpty(currentDraft);
}

interface EditorDraftSync {
    nextDraft: EditorDraft;
    shouldReset: boolean;
}

// Decides what an incoming note prop means for the mounted editor. A save
// echoes the note back through the store, so a draft the user is ahead of
// must survive that echo; anything else that differs resets the session.
function resolveEditorDraftSync(
    note: SidePanelNote | null,
    savedNoteId: string | null,
    latestDraft: EditorDraft,
    initialDraft: EditorDraft
): EditorDraftSync {
    const nextDraft = editorDraftFromItem(note);
    const noteId = note?.id ?? null;
    const shouldPreserveLocalDraft =
        noteId !== null &&
        noteId === savedNoteId &&
        haveDraftsChanged(latestDraft, initialDraft) &&
        haveDraftsChanged(nextDraft, latestDraft);

    return {
        nextDraft,
        shouldReset:
            !shouldPreserveLocalDraft &&
            haveDraftsChanged(nextDraft, latestDraft),
    };
}

function getNotionNoteTitle(plainText: string): string {
    for (const line of plainText.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
            return trimmed;
        }
    }
    return "";
}

function preserveEditorSelection(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
}

function getSelectionBlockType(selection: RangeSelection): EditorBlockType {
    const anchorNode = selection.anchor.getNode();
    const topLevelNode = $isRootNode(anchorNode)
        ? anchorNode
        : anchorNode.getTopLevelElement();

    if (!(topLevelNode && $isHeadingNode(topLevelNode))) {
        return "paragraph";
    }

    const headingTag = topLevelNode.getTag();
    if (headingTag === "h1" || headingTag === "h2" || headingTag === "h3") {
        return headingTag;
    }
    return "paragraph";
}

function getInitialEditorState(
    initialDraft: EditorDraft
): InitialEditorStateType {
    if (initialDraft.contentState) {
        return JSON.stringify(initialDraft.contentState);
    }

    if (normalizeHtml(initialDraft.contentHtml) === NOTE_EMPTY_HTML) {
        return null;
    }

    return (editor: LexicalEditor) => {
        const dom = new DOMParser().parseFromString(
            initialDraft.contentHtml,
            "text/html"
        );
        const nodes = $generateNodesFromDOM(editor, dom);
        const root = $getRoot();

        root.clear();
        root.append(...nodes);

        if (root.getChildrenSize() === 0) {
            root.append($createParagraphNode());
        }
    };
}

function createEditorSessionExtension(initialDraft: EditorDraft) {
    return defineExtension({
        $initialEditorState: getInitialEditorState(initialDraft),
        dependencies: [EDITOR_EXTENSION],
        name: `${EDITOR_NAMESPACE}-session`,
        namespace: EDITOR_NAMESPACE,
    });
}

interface EditorProps {
    children?: ReactNode;
    closeNoteTab: (id: string) => void;
    isActive: boolean;
    note: SidePanelNote | null;
    onClosePreview: () => void;
    onSaveNote: EditorSaveHandler;
    onUrlPaste: (url: string) => Promise<void> | void;
    registerNoteClose: (
        id: string,
        close: () => void | Promise<void>
    ) => () => void;
    tabId: string;
}

export function NoteEditor(props: EditorProps) {
    return (
        <Editor {...props}>
            <ScrollArea className="min-w-0 flex-1">
                <div className="w-full min-w-0 p-4 pt-0">
                    <div className="mt-2 mb-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <EditorFormatControls />
                        <EditorExportControls />
                    </div>
                    <EditorContent />
                    <EditorFooter />
                </div>
            </ScrollArea>
        </Editor>
    );
}

function Editor({
    children,
    closeNoteTab,
    isActive,
    note,
    onClosePreview,
    onSaveNote,
    onUrlPaste,
    registerNoteClose,
    tabId,
}: EditorProps) {
    const [initialDraft, setInitialDraft] = useState<EditorDraft>(() =>
        editorDraftFromItem(note)
    );
    const [draft, setDraft] = useState<EditorDraft>(initialDraft);
    // The extension object carries the initial editor state, so a reset must
    // swap both atomically. One state keeps the key and the extension in
    // agreement with no render-phase sync.
    const [session, setSession] = useState(() => ({
        extension: createEditorSessionExtension(initialDraft),
        key: 0,
    }));
    const isClosingRef = useRef(false);
    const contentEditableRef = useRef<HTMLDivElement | null>(null);

    const initialDraftRef = useRef<EditorDraft>(draft);
    const latestDraftRef = useRef<EditorDraft>(draft);

    const noteId = note?.id ?? null;
    const savedNoteIdRef = useRef<string | null>(noteId);

    const [prevNote, setPrevNote] = useState(note);

    if (!Object.is(note, prevNote)) {
        setPrevNote(note);
        const sync = resolveEditorDraftSync(
            note,
            savedNoteIdRef.current,
            latestDraftRef.current,
            initialDraftRef.current
        );
        setInitialDraft(sync.nextDraft);

        if (sync.shouldReset) {
            setDraft(sync.nextDraft);
            setSession((current) => ({
                extension: createEditorSessionExtension(sync.nextDraft),
                key: current.key + 1,
            }));
        }
    }

    useIsoLayoutEffect(() => {
        savedNoteIdRef.current = noteId;
        initialDraftRef.current = initialDraft;
        latestDraftRef.current = draft;
    }, [noteId, initialDraft, draft]);

    const handleDraftChange = useStableCallback((nextDraft: EditorDraft) => {
        const normalizedDraft = normalizeDraft(nextDraft);
        if (!haveDraftsChanged(normalizedDraft, latestDraftRef.current)) {
            return;
        }
        latestDraftRef.current = normalizedDraft;
        setDraft(normalizedDraft);
    });

    const handleSave = useStableCallback(
        (draftToSave: EditorDraft, targetNoteId: string | null) =>
            onSaveNote(draftToSave, targetNoteId)
    );

    const handleUrlPaste = useStableCallback(async (url: string) => {
        await onUrlPaste(url);
        closeNoteTab(tabId);
    });

    const shouldCreateBookmarkFromUrlPaste = useStableCallback(
        () => !savedNoteIdRef.current && isDraftEmpty(latestDraftRef.current)
    );

    const saveLatestDraft = useStableCallback(async () => {
        const draftToSave = latestDraftRef.current;
        if (
            shouldCloseWithoutSaving(
                draftToSave,
                initialDraftRef.current,
                savedNoteIdRef.current !== null
            )
        ) {
            return draftToSave.contentHtml;
        }

        const savedNote = await handleSave(draftToSave, savedNoteIdRef.current);
        if (!savedNote) {
            return false;
        }

        savedNoteIdRef.current = savedNote.id;
        initialDraftRef.current = draftToSave;
        setInitialDraft(draftToSave);

        return draftToSave.contentHtml;
    });

    const {
        isDirty,
        saveImmediately,
        status: saveStatus,
    } = useAutosave({
        content: draft.contentHtml,
        onSave: saveLatestDraft,
        savedContent: initialDraft.contentHtml,
    });

    const handleSaveShortcut = useStableCallback((event: KeyboardEvent) => {
        if (
            event.defaultPrevented ||
            !(event.metaKey || event.ctrlKey) ||
            event.key.toLowerCase() !== "s"
        ) {
            return;
        }

        event.preventDefault();
        saveImmediately().catch((error: unknown) => {
            log.error("Unexpected note shortcut save failure", error);
        });
    });

    // The keydown listener lives on the owner document of the editor, so a
    // tab that stays mounted still saves while its editor holds focus.
    useEffect(() => {
        if (!isActive) {
            return;
        }

        const ownerDocument = getOwnerDocument(contentEditableRef.current);
        ownerDocument.addEventListener("keydown", handleSaveShortcut);
        return () => {
            ownerDocument.removeEventListener("keydown", handleSaveShortcut);
        };
    }, [handleSaveShortcut, isActive]);

    // Activating a tab must land the caret in the editor, so the notes panel
    // is the only one that does not move focus to the tab itself.
    useIsoLayoutEffect(() => {
        if (isActive) {
            contentEditableRef.current?.focus({ preventScroll: true });
        }
    }, [isActive]);

    const handleClose = useStableCallback(async () => {
        if (isClosingRef.current) {
            return;
        }

        const currentDraft = latestDraftRef.current;
        const shouldSkipSave = shouldCloseWithoutSaving(
            currentDraft,
            initialDraftRef.current,
            savedNoteIdRef.current !== null
        );

        if (shouldSkipSave) {
            closeNoteTab(tabId);
            return;
        }

        isClosingRef.current = true;
        try {
            const isSaved = await saveImmediately();
            if (isSaved) {
                closeNoteTab(tabId);
            }
        } finally {
            isClosingRef.current = false;
        }
    });

    // The tab's close button removes this panel, so the registered handler
    // must flush the draft first: only this component owns the save state.
    useIsoLayoutEffect(
        () => registerNoteClose(tabId, handleClose),
        [handleClose, registerNoteClose, tabId]
    );

    const handleEnterShortcut = useStableCallback((event: KeyboardEvent) => {
        if (
            event.defaultPrevented ||
            event.isComposing ||
            event.key !== "Enter"
        ) {
            return;
        }

        const isToggleShortcut =
            (event.metaKey || event.ctrlKey) &&
            !event.altKey &&
            !event.shiftKey;

        if (!isToggleShortcut) {
            return;
        }

        event.preventDefault();
        // Stop modified Enter before Lexical runs its block-splitting handler
        // and before the global toggle shortcut sees the same keystroke.
        event.stopPropagation();
        saveImmediately().then(
            () => {
                onClosePreview();
            },
            (error: unknown) => {
                log.error("Unexpected note shortcut close failure", error);
                onClosePreview();
            }
        );
    });

    // The keydown listener lives on the owner document of the editor, so the
    // shortcut works from anywhere in an active editor tab.
    useEffect(() => {
        if (!isActive) {
            return;
        }

        const ownerDocument = getOwnerDocument(contentEditableRef.current);
        ownerDocument.addEventListener("keydown", handleEnterShortcut, true);
        return () => {
            ownerDocument.removeEventListener(
                "keydown",
                handleEnterShortcut,
                true
            );
        };
    }, [handleEnterShortcut, isActive]);

    const textMetrics = getEditorTextMetrics(draft.contentHtml);

    const actionsContextValue = useRefWithInit(() => ({
        contentEditableRef,
        onDraftChange: handleDraftChange,
        onUrlPaste: handleUrlPaste,
        shouldCreateBookmarkFromUrlPaste,
    })).current;

    const draftContextValue: EditorDraftContext = {
        contentHtml: draft.contentHtml,
        isDirty,
        noteId,
        saveStatus,
        textMetrics,
    };

    return (
        <LexicalExtensionComposer
            contentEditable={null}
            extension={session.extension}
            key={session.key}
        >
            <EditorActionsContext value={actionsContextValue}>
                <EditorDraftContext value={draftContextValue}>
                    {children}
                </EditorDraftContext>
            </EditorActionsContext>
        </LexicalExtensionComposer>
    );
}

function EditorExportControls() {
    const gt = useGT();
    const { contentHtml, noteId, textMetrics } = useEditorDraftContext();
    const { plainText } = textMetrics;
    const { copyToClipboard, isCopied } = useCopyToClipboard();
    const { items } = useItemsStateContext();

    const [isSendingToNotion, startSendToNotion] = useTransition();
    const [notionStatus, setNotionStatus] = useState<{
        message: string;
        tone: "error" | "success";
    } | null>(null);

    const hasPlainText = plainText.length > 0;

    // Collection assignment needs the persisted library item, so an unsaved
    // draft offers no combobox until its first autosave creates the note.
    const noteItem =
        noteId === null
            ? null
            : (items.find((item) => item.id === noteId) ?? null);

    const assignedCollectionCount = noteItem?.collections.length ?? 0;
    const assignCollectionsLabel =
        assignedCollectionCount === 0
            ? gt("Assign collections")
            : gt("Change or add collections ({count} selected)", {
                  count: assignedCollectionCount,
              });

    const handleCopyNote = useStableCallback(() => {
        if (!hasPlainText) {
            return;
        }
        copyToClipboard(plainText);
    });

    const handleExportMarkdown = useStableCallback(() => {
        const markdown = convertNoteHtmlToMarkdown(contentHtml);
        const blob = new Blob([markdown], { type: "text/markdown" });
        saveFile(blob, {
            description: gt("Markdown file"),
            extension: "md",
            name: slugify(getNotionNoteTitle(plainText)) || "note",
        }).catch((error: unknown) => {
            log.error("Unexpected Markdown export failure", error);
        });
    });

    const handleSendToNotion = useStableCallback(() => {
        if (!hasPlainText || isSendingToNotion) {
            return;
        }

        setNotionStatus(null);
        startSendToNotion(async () => {
            const result = await sendNoteToNotion({
                contentHtml,
                title: getNotionNoteTitle(plainText),
            }).catch(() => {
                setNotionStatus({
                    message: gt("We couldn't send this to Notion right now."),
                    tone: "error",
                });
                return null;
            });

            if (result === null) {
                return;
            }

            if (result.status === "SUCCESS") {
                setNotionStatus({
                    message: gt("Sent to Notion."),
                    tone: "success",
                });
                openExternalUrl(result.pageUrl);
                return;
            }

            setNotionStatus({
                message: result.message,
                tone: "error",
            });
        });
    });

    return (
        <div className="ms-auto inline-flex items-center justify-end gap-px">
            <EditorStatus />
            {noteItem ? (
                <ItemCollectionsCombobox
                    items={[noteItem]}
                    render={
                        <Button
                            aria-label={assignCollectionsLabel}
                            size="icon-sm"
                            variant="ghost"
                        />
                    }
                />
            ) : null}
            <Button
                aria-label={gt("Copy note")}
                disabled={!hasPlainText}
                onClick={handleCopyNote}
                size="icon-sm"
                variant="ghost"
            >
                {isCopied ? (
                    <CheckIcon
                        aria-hidden
                        className="size-3.5"
                        focusable="false"
                    />
                ) : (
                    <Copy aria-hidden className="size-3.5" focusable="false" />
                )}
            </Button>
            <Menu>
                <MenuTrigger
                    render={
                        <Button
                            disabled={!hasPlainText}
                            size="sm"
                            variant="ghost"
                        />
                    }
                >
                    <T>Open in</T>
                    <ChevronDownIcon className="size-3.5 opacity-50" />
                </MenuTrigger>
                <MenuPopup align="start" className="w-60">
                    {EXPORT_CONTENT_PROVIDERS.map((provider) => (
                        <EditorExportMenuItem
                            hasPlainText={hasPlainText}
                            key={provider.id}
                            plainText={plainText}
                            provider={provider}
                        />
                    ))}
                    <MenuItem
                        disabled={!hasPlainText || isSendingToNotion}
                        onClick={handleSendToNotion}
                    >
                        <NotionIcon className="text-muted-foreground size-4" />
                        <TextMorph className="flex-1">
                            {isSendingToNotion
                                ? gt("Sending to Notion…")
                                : gt("Send to Notion")}
                        </TextMorph>
                        <ExternalLinkIcon className="text-muted-foreground size-4" />
                    </MenuItem>
                    {notionStatus ? (
                        <p
                            aria-live={
                                notionStatus.tone === "error"
                                    ? "assertive"
                                    : "polite"
                            }
                            className={cn(
                                "px-2 py-1 text-xs leading-tight",
                                notionStatus.tone === "error"
                                    ? "text-destructive"
                                    : "text-muted-foreground"
                            )}
                            role={
                                notionStatus.tone === "error"
                                    ? "alert"
                                    : "status"
                            }
                        >
                            {notionStatus.message}
                        </p>
                    ) : null}
                    <MenuSeparator />
                    <MenuItem
                        disabled={!hasPlainText}
                        onClick={handleExportMarkdown}
                    >
                        <FileTextIcon className="text-muted-foreground size-4" />
                        <span className="flex-1">
                            <T>Export to Markdown</T>
                        </span>
                        <DownloadIcon className="text-muted-foreground size-4" />
                    </MenuItem>
                </MenuPopup>
            </Menu>
        </div>
    );
}

function EditorFooter() {
    const { textMetrics } = useEditorDraftContext();

    const shouldShowReadTime = textMetrics.readMinuteCount >= 2;
    const closeShortcut = `${getSystemControlKey()}+Enter`;

    return (
        <div className="border-border/60 text-muted-foreground mt-3 flex items-center justify-end gap-4 border-t pt-3 text-xs">
            <T>
                <span className="mr-auto">
                    <Var>{closeShortcut}</Var> to close
                </span>
            </T>
            {shouldShowReadTime ? (
                <T>
                    <span>
                        <Var>{textMetrics.readMinuteCount}</Var> minute read
                    </span>
                </T>
            ) : null}
            <T>
                <span>
                    <Var>{textMetrics.wordCount}</Var> words
                </span>
            </T>
            <T>
                <span>
                    <Var>{textMetrics.paragraphCount}</Var> paragraphs
                </span>
            </T>
            <T>
                <span>
                    <Var>{textMetrics.characterCount}</Var> characters
                </span>
            </T>
        </div>
    );
}

function EditorStatus() {
    const gt = useGT();
    const { isDirty, saveStatus } = useEditorDraftContext();

    let message = "";
    let isError = false;

    if (saveStatus === "saving") {
        message = gt("Saving…");
    } else if (saveStatus === "error") {
        message = gt("Not saved");
        isError = true;
    } else if (saveStatus === "saved") {
        message = gt("Saved");
    } else if (isDirty) {
        message = gt("Unsaved");
    }

    if (!message) {
        return null;
    }

    return (
        <span
            aria-live={isError ? "assertive" : "polite"}
            className={cn(
                "px-1 text-xs",
                isError ? "text-destructive" : "text-muted-foreground"
            )}
            role={isError ? "alert" : "status"}
        >
            <TextMorph>{message}</TextMorph>
        </span>
    );
}

interface EditorExportMenuItemProps {
    hasPlainText: boolean;
    plainText: string;
    provider: EditorExportProvider;
}

function EditorExportMenuItem({
    hasPlainText,
    plainText,
    provider,
}: EditorExportMenuItemProps) {
    const gt = useGT();

    const ProviderIcon = provider.icon;
    const href = provider.createUrl(plainText);

    let label: string;
    switch (provider.id) {
        case "chatgpt":
            label = gt("Open in ChatGPT");
            break;
        case "claude":
            label = gt("Open in Claude");
            break;
        case "codex":
            label = gt("Open in Codex");
            break;
        case "cursor":
            label = gt("Open in Cursor");
            break;
        case "google-docs":
            label = gt("Open in Google Docs");
            break;
        case "t3-chat":
            label = gt("Open in T3 Chat");
            break;
        case "v0":
            label = gt("Open in v0");
            break;
        default:
            throw new Error(
                `Unknown export provider: ${provider.id satisfies never}`
            );
    }

    return (
        <MenuItem
            disabled={!hasPlainText}
            render={<a href={href} rel="noopener noreferrer" target="_blank" />}
        >
            <ProviderIcon className="text-muted-foreground size-4" />
            <span className="flex-1">{label}</span>
            <ExternalLinkIcon className="text-muted-foreground size-4" />
        </MenuItem>
    );
}

function EditorFormatControls() {
    const gt = useGT();
    const [editor] = useLexicalComposerContext();
    const [formats, setFormats] =
        useState<EditorFormatState>(INITIAL_FORMAT_STATE);

    const rovingTabIndexRef = useLexicalRovingTabIndexRef();
    const focusManagerRef = useLexicalFocusManagerRef();
    const mergedRefs = useMergedRefs(rovingTabIndexRef, focusManagerRef);

    const commitFormats = useStableCallback(
        (nextFormats: EditorFormatState) => {
            setFormats((current) =>
                current.blockType === nextFormats.blockType &&
                current.bold === nextFormats.bold &&
                current.italic === nextFormats.italic &&
                current.strikethrough === nextFormats.strikethrough &&
                current.underline === nextFormats.underline
                    ? current
                    : nextFormats
            );
        }
    );

    const syncToolbarSelection = useStableCallback(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
            commitFormats(INITIAL_FORMAT_STATE);
            return;
        }

        commitFormats({
            blockType: getSelectionBlockType(selection),
            bold: selection.hasFormat("bold"),
            italic: selection.hasFormat("italic"),
            strikethrough: selection.hasFormat("strikethrough"),
            underline: selection.hasFormat("underline"),
        });
    });

    const updateToolbarState = useStableCallback(() => {
        editor.getEditorState().read(syncToolbarSelection);
    });

    useEffect(() => {
        updateToolbarState();

        return mergeRegister(
            editor.registerUpdateListener(({ editorState }) => {
                editorState.read(syncToolbarSelection);
            }),
            // SELECTION_CHANGE_COMMAND runs before reconciliation in the
            // pending update, so read the pending selection directly.
            // Reading through getEditorState() here would return the last
            // committed selection instead.
            editor.registerCommand(
                SELECTION_CHANGE_COMMAND,
                () => {
                    syncToolbarSelection();
                    return false;
                },
                COMMAND_PRIORITY_LOW
            )
        );
    }, [editor, syncToolbarSelection, updateToolbarState]);

    return (
        <div
            aria-label={gt("Text formatting")}
            aria-orientation="horizontal"
            className="flex min-w-0 flex-wrap items-center justify-start gap-3"
            ref={mergedRefs}
            role="toolbar"
        >
            {EDITOR_BLOCK_VALUES.map((value) => (
                <EditorBlockTypeButton
                    isActive={formats.blockType === value}
                    key={value}
                    value={value}
                />
            ))}
            {EDITOR_TEXT_FORMAT_OPTIONS.map((option) => (
                <EditorInlineFormatButton
                    isActive={formats[option.format]}
                    key={option.format}
                    option={option}
                />
            ))}
        </div>
    );
}

interface EditorBlockTypeButtonProps {
    isActive: boolean;
    value: EditorBlockType;
}

function EditorBlockTypeButton({
    isActive,
    value,
}: EditorBlockTypeButtonProps) {
    const gt = useGT();
    const [editor] = useLexicalComposerContext();

    const handleClick = useStableCallback(() => {
        editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) {
                return;
            }
            if (value === "paragraph") {
                $setBlocksType(selection, () => $createParagraphNode());
                return;
            }
            $setBlocksType(selection, () => $createHeadingNode(value));
        });
    });

    let ariaLabel: string;
    let label: string;
    switch (value) {
        case "h1":
            ariaLabel = gt("Heading 1");
            label = "H1";
            break;
        case "h2":
            ariaLabel = gt("Heading 2");
            label = "H2";
            break;
        case "h3":
            ariaLabel = gt("Heading 3");
            label = "H3";
            break;
        case "paragraph":
            ariaLabel = gt("Paragraph");
            label = "Text";
            break;
        default:
            throw new Error(
                `Unknown note block type: ${value satisfies never}`
            );
    }

    return (
        <Button
            aria-label={ariaLabel}
            onClick={handleClick}
            onMouseDown={preserveEditorSelection}
            size="xs"
            variant={isActive ? "secondary" : "ghost"}
        >
            {label}
        </Button>
    );
}

interface EditorInlineFormatButtonProps {
    isActive: boolean;
    option: (typeof EDITOR_TEXT_FORMAT_OPTIONS)[number];
}

function EditorInlineFormatButton({
    isActive,
    option,
}: EditorInlineFormatButtonProps) {
    const gt = useGT();
    const [editor] = useLexicalComposerContext();

    const Icon = option.icon;

    const handleClick = useStableCallback(() => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, option.format);
    });

    let ariaLabel: string;
    const format = option.format;
    switch (format) {
        case "bold":
            ariaLabel = gt("Bold");
            break;
        case "italic":
            ariaLabel = gt("Italic");
            break;
        case "strikethrough":
            ariaLabel = gt("Strikethrough");
            break;
        case "underline":
            ariaLabel = gt("Underline");
            break;
        default:
            throw new Error(
                `Unknown note text format: ${format satisfies never}`
            );
    }

    return (
        <Button
            aria-label={ariaLabel}
            className={cn(isActive && "bg-accent")}
            onClick={handleClick}
            onMouseDown={preserveEditorSelection}
            size="icon-xs"
            variant="ghost"
        >
            <Icon className="size-4" />
        </Button>
    );
}

function EditorContent() {
    const { contentEditableRef } = useEditorActionsContext();

    return (
        <div className="relative min-h-96 w-full min-w-0 flex-1">
            <ContentEditable
                className={cn(
                    "prose prose-stone min-h-96 w-full max-w-full min-w-0 text-[15px] leading-7 wrap-anywhere whitespace-pre-wrap outline-none",
                    "prose-p:my-0 prose-p:min-h-[1.75rem]",
                    "prose-mark:rounded-sm prose-mark:bg-amber-200/90 prose-mark:px-0.5",
                    "prose-strong:font-semibold prose-em:italic prose-u:underline prose-s:line-through"
                )}
                ref={contentEditableRef}
            />
            <EditorPlaceholder />
            <EditorChangeReporter />
            <EditorUrlPasteHandler />
        </div>
    );
}

function EditorPlaceholder() {
    const [editor] = useLexicalComposerContext();
    const isEmpty = useLexicalIsTextContentEmpty(editor, true);
    const isEditable = useLexicalEditable();

    if (!(isEditable && isEmpty)) {
        return null;
    }

    return (
        <div
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute inset-0 text-[15px] leading-7"
        >
            <T>Start writing, or paste a link to add</T>
        </div>
    );
}

function EditorChangeReporter() {
    const { onDraftChange } = useEditorActionsContext();

    const handleChange = useStableCallback((editorState: EditorState) => {
        onDraftChange(editorDraftFromEditorState(editorState.toJSON()));
    });

    return <OnChangePlugin ignoreSelectionChange onChange={handleChange} />;
}

function EditorUrlPasteHandler() {
    const { onUrlPaste, shouldCreateBookmarkFromUrlPaste } =
        useEditorActionsContext();
    const [editor] = useLexicalComposerContext();

    const handlePaste = useStableCallback((event: PasteCommandType) => {
        if (!shouldCreateBookmarkFromUrlPaste()) {
            return false;
        }

        if (!("clipboardData" in event && event.clipboardData)) {
            return false;
        }

        const pastedText = event.clipboardData.getData("text/plain");
        const parsedUrl = parseStandaloneUrl(pastedText);
        if (!parsedUrl) {
            return false;
        }

        event.preventDefault();
        const pasteResult = onUrlPaste(parsedUrl.href);
        pasteResult?.catch((error: unknown) => {
            log.error("Unexpected editor URL paste failure", error);
        });
        return true;
    });

    useEffect(
        () =>
            editor.registerCommand(
                PASTE_COMMAND,
                handlePaste,
                COMMAND_PRIORITY_LOW
            ),
        [editor, handlePaste]
    );

    return null;
}
