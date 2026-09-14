"use client";

import * as React from "react";
import type {
    LibraryItemCollectionsUpdateResult,
    LibraryItemFavoriteToggleResult,
} from "@/lib/collections/items";
import type { LibraryItemWithCollections } from "@/lib/collections/utils";

export interface ItemsContext {
    collectionPreviewThumbnailUrlsById: Map<string, string[]>;
    favoriteItemIdSet: ReadonlySet<string>;
    favoriteItems: LibraryItemWithCollections[];
    items: LibraryItemWithCollections[];
    itemsByCollectionId: Map<string, LibraryItemWithCollections[]>;
    mergeImportedItems: (items: LibraryItemWithCollections[]) => void;
    onCopyLink: (item: LibraryItemWithCollections) => void;
    onDelete: (item: LibraryItemWithCollections) => void;
    onFindSimilar: (item: LibraryItemWithCollections) => void;
    onItemFavoriteToggle: (
        item: LibraryItemWithCollections
    ) => Promise<LibraryItemFavoriteToggleResult>;
    onOpenFavoriteItem: (item: LibraryItemWithCollections) => void;
    onOpenInNewTab: (item: LibraryItemWithCollections) => void;
    onOpenNote: (item: LibraryItemWithCollections) => void;
    onUpdateItemCollections: (
        itemId: string,
        collectionIds: string[]
    ) => Promise<LibraryItemCollectionsUpdateResult>;
    pendingDeleteItemId: string | null;
    setItems: React.Dispatch<
        React.SetStateAction<LibraryItemWithCollections[]>
    >;
}

export interface ItemsStateContext {
    items: LibraryItemWithCollections[];
    setItems: React.Dispatch<
        React.SetStateAction<LibraryItemWithCollections[]>
    >;
}

export const ItemsContext = React.createContext<ItemsContext | null>(null);

export const ItemsStateContext = React.createContext<ItemsStateContext | null>(
    null
);

export function useItemsContext(): ItemsContext {
    const context = React.use(ItemsContext);
    if (!context) {
        throw new Error(
            "Library items context is required for library item controls."
        );
    }
    return context;
}

export function useItemsStateContext(): ItemsStateContext {
    const context = React.use(ItemsStateContext);
    if (!context) {
        throw new Error(
            "Library items state is required for library item mutations."
        );
    }
    return context;
}

interface ItemsStateProviderProps extends React.PropsWithChildren {
    initialItems: LibraryItemWithCollections[];
}

export function ItemsStateProvider({
    children,
    initialItems,
}: ItemsStateProviderProps) {
    const [items, setItems] = React.useState(initialItems);

    return (
        <ItemsStateContext value={{ items, setItems }}>
            {children}
        </ItemsStateContext>
    );
}
