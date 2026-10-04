"use client";

import { useRefWithInit } from "@base-ui/utils/useRefWithInit";
import * as React from "react";
import {
    createDimensionsCache,
    type DimensionsCache,
} from "@/lib/common/dimension";

const DimensionsCacheContext = React.createContext<DimensionsCache | null>(
    null
);

export function useDimensionCacheContext(): DimensionsCache {
    const context = React.use(DimensionsCacheContext);
    if (!context) {
        throw new Error(
            "useDimensionCacheContext must be used within a <DimensionCacheProvider>."
        );
    }
    return context;
}

export function DimensionCacheProvider({ children }: React.PropsWithChildren) {
    const contextValue = useRefWithInit(createDimensionsCache).current;

    return (
        <DimensionsCacheContext value={contextValue}>
            {children}
        </DimensionsCacheContext>
    );
}
