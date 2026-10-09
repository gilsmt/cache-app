import "server-only";

import { ITEM_KIND_BOOKMARK, ITEM_KIND_FOLDER } from "@/lib/common/constants";
import { parseDate } from "@/lib/common/date";
import type { LibraryItem, Prisma } from "@/prisma/client/client";
import { type LibraryItemKind, LibraryItemSource } from "@/prisma/client/enums";

const CHROME_FOLDER_URL_PREFIX = "cache://chrome-bookmarks/folder/";

type ChromeItemKind = typeof ITEM_KIND_BOOKMARK | typeof ITEM_KIND_FOLDER;

export interface ChromeBookmarkRecord {
    browserProfileId: string;
    caption: string | null;
    externalId: string;
    kind: ChromeItemKind;
    parentExternalId: string | null;
    postedAt: Date | null;
    scrapedAt: Date;
    source: typeof LibraryItemSource.chrome_bookmarks;
    sourceDeviceId: string | null;
    sourceDeviceName: string | null;
    sourceMetadata: Prisma.InputJsonObject;
    url: string;
}

type ChromeLibraryRow = LibraryItem;

export interface ChromeBatchLookupState {
    aliasToPrimaryId: Map<string, string>;
    duplicateToPrimaryId: Map<string, string>;
    rowsById: Map<string, ChromeLibraryRow>;
    rowsByPrimaryExternalId: Map<string, ChromeLibraryRow>;
}

export interface ChromeBookmarkNode {
    dateAdded?: number;
    dateGroupModified?: number;
    externalId: string;
    index?: number;
    kind: typeof ITEM_KIND_BOOKMARK | typeof ITEM_KIND_FOLDER;
    parentExternalId?: string;
    title?: string;
    /** Validated as a valid URL by the zod schema in the service layer. */
    url?: string;
}

type ChromeBookmarkDevice =
    | { id: string; name?: string; os?: string }
    | undefined;

export type ChromeLibraryItemDelegate = Prisma.TransactionClient["libraryItem"];

export function normalizeChromeCaption(
    value: string | null | undefined
): string {
    return (value ?? "")
        .trim()
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ");
}

export function chromeDuplicateKey(
    kind: LibraryItemKind,
    url: string,
    caption: string | null
): string | null {
    if (kind !== ITEM_KIND_BOOKMARK) {
        return null;
    }
    return `${url}\u0000${normalizeChromeCaption(caption)}`;
}

export function chromeFolderUrl(
    browserProfileId: string,
    externalId: string
): string {
    return `${CHROME_FOLDER_URL_PREFIX}${encodeURIComponent(browserProfileId)}/${encodeURIComponent(externalId)}`;
}

export function normalizeChromeBookmarkRecord(
    browserProfileId: string,
    bookmark: ChromeBookmarkNode,
    occurredAt: string | undefined,
    device: ChromeBookmarkDevice
): ChromeBookmarkRecord {
    const title = bookmark.title?.trim();
    const metadata = {
        chrome: {
            dateAdded: bookmark.dateAdded ?? null,
            dateGroupModified: bookmark.dateGroupModified ?? null,
            index: bookmark.index ?? null,
        },
        device: device
            ? {
                  id: device.id,
                  name: device.name ?? null,
                  os: device.os ?? null,
              }
            : null,
    };

    return {
        browserProfileId,
        caption: title && title.length > 0 ? title : null,
        externalId: bookmark.externalId,
        kind:
            bookmark.kind === ITEM_KIND_FOLDER
                ? ITEM_KIND_FOLDER
                : ITEM_KIND_BOOKMARK,
        parentExternalId: bookmark.parentExternalId ?? null,
        postedAt:
            typeof bookmark.dateAdded === "number"
                ? parseDate(new Date(bookmark.dateAdded))
                : null,
        scrapedAt: parseDate(occurredAt) ?? new Date(),
        source: LibraryItemSource.chrome_bookmarks,
        sourceDeviceId: device ? device.id : null,
        sourceDeviceName: device?.name ?? null,
        sourceMetadata: metadata,
        url:
            bookmark.kind === ITEM_KIND_FOLDER
                ? chromeFolderUrl(browserProfileId, bookmark.externalId)
                : (bookmark.url ??
                  chromeFolderUrl(browserProfileId, bookmark.externalId)),
    };
}

export function buildChromeBookmarkUpdateData(
    record: ChromeBookmarkRecord
): Prisma.LibraryItemUpdateInput {
    return {
        caption: record.caption,
        kind: record.kind,
        parentExternalId: record.parentExternalId,
        postedAt: record.postedAt,
        scrapedAt: record.scrapedAt,
        sourceDeviceId: record.sourceDeviceId,
        sourceDeviceName: record.sourceDeviceName,
        sourceMetadata: record.sourceMetadata,
        url: record.url,
    };
}

export function promoteAliasToPrimary(
    delegate: ChromeLibraryItemDelegate,
    row: ChromeLibraryRow,
    externalId: string
) {
    const aliasIds = new Set(row.sourceAliasIds);
    aliasIds.delete(externalId);
    aliasIds.add(row.externalId);

    return delegate.update({
        data: {
            externalId,
            sourceAliasIds: [...aliasIds],
        },
        where: { id: row.id },
    });
}

export function removeChromeLookupRow(
    state: ChromeBatchLookupState,
    row: ChromeLibraryRow
): void {
    state.rowsById.delete(row.id);
    state.rowsByPrimaryExternalId.delete(row.externalId);

    for (const aliasId of row.sourceAliasIds) {
        state.aliasToPrimaryId.delete(aliasId);
    }

    const duplicateKey = chromeDuplicateKey(row.kind, row.url, row.caption);
    if (duplicateKey) {
        state.duplicateToPrimaryId.delete(duplicateKey);
    }
}

export function upsertChromeLookupRow(
    state: ChromeBatchLookupState,
    row: ChromeLibraryRow
): void {
    state.rowsById.set(row.id, row);
    state.rowsByPrimaryExternalId.set(row.externalId, row);

    for (const aliasId of row.sourceAliasIds) {
        state.aliasToPrimaryId.set(aliasId, row.id);
    }

    const duplicateKey = chromeDuplicateKey(row.kind, row.url, row.caption);
    if (duplicateKey && !state.duplicateToPrimaryId.has(duplicateKey)) {
        state.duplicateToPrimaryId.set(duplicateKey, row.id);
    }
}

export function buildChromeLookupState(rows: ChromeLibraryRow[]) {
    const state: ChromeBatchLookupState = {
        aliasToPrimaryId: new Map(),
        duplicateToPrimaryId: new Map(),
        rowsById: new Map(),
        rowsByPrimaryExternalId: new Map(),
    };

    for (const row of rows) {
        upsertChromeLookupRow(state, row);
    }

    return state;
}

export function replaceChromeLookupRow(
    state: ChromeBatchLookupState,
    previous: ChromeLibraryRow,
    next: ChromeLibraryRow
): void {
    removeChromeLookupRow(state, previous);
    upsertChromeLookupRow(state, next);
}
