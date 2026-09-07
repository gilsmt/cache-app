/**
 * Session cache of masonry preview image dimensions (url → natural size).
 * Keeps virtualized cards from reshuffling when images fail or remount.
 */

export interface Dimensions {
    readonly h: number;
    readonly w: number;
}

export const DEFAULT_DIMENSIONS = {
    h: 4,
    w: 3,
} as const satisfies Dimensions;

const PREVIEW_DIMENSIONS_CACHE_MAX = 500;

const PREVIEW_MIN_ASPECT_RATIO = 1 / 4;
const PREVIEW_MAX_ASPECT_RATIO = 3;
const PREVIEW_MIN_HEIGHT = 1;

export interface DimensionsCache {
    cacheDimensions: (src: string, dimensions: Dimensions) => void;
    pinDefaultDimensionsIfMissing: (src: string) => Dimensions;
    readCachedDimensions: (src: string | null) => Dimensions | null;
}

export function createDimensionsCache(): DimensionsCache {
    const previewDimensionsCache = new Map<string, Dimensions>();

    function readCachedDimensions(src: string | null): Dimensions | null {
        if (!src) {
            return null;
        }
        return previewDimensionsCache.get(src) ?? null;
    }

    function cacheDimensions(src: string, dimensions: Dimensions): void {
        // Reinsert so updates act as LRU touches (write path only — keep reads pure).
        if (previewDimensionsCache.has(src)) {
            previewDimensionsCache.delete(src);
        } else if (
            previewDimensionsCache.size >= PREVIEW_DIMENSIONS_CACHE_MAX
        ) {
            const oldestKey = previewDimensionsCache.keys().next().value;
            if (oldestKey !== undefined) {
                previewDimensionsCache.delete(oldestKey);
            }
        }
        previewDimensionsCache.set(src, dimensions);
    }

    function pinDefaultDimensionsIfMissing(src: string): Dimensions {
        const existing = previewDimensionsCache.get(src);
        if (existing !== undefined) {
            return existing;
        }
        cacheDimensions(src, DEFAULT_DIMENSIONS);
        return DEFAULT_DIMENSIONS;
    }

    return {
        cacheDimensions,
        pinDefaultDimensionsIfMissing,
        readCachedDimensions,
    };
}

/** The aspect slot to render: cached dimensions when known, else the default, clamped to masonry bounds. */
export function resolveDisplayDimensions(
    dimensions: Dimensions | null
): Dimensions {
    return clampDimensions(dimensions ?? DEFAULT_DIMENSIONS);
}

function clampDimensions(dimensions: Dimensions): Dimensions {
    const { h, w } = dimensions;
    if (!(Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0)) {
        return { ...DEFAULT_DIMENSIONS };
    }
    const aspectRatio = h / w;
    if (aspectRatio > PREVIEW_MAX_ASPECT_RATIO) {
        return {
            h: Math.max(
                PREVIEW_MIN_HEIGHT,
                Math.round(w * PREVIEW_MAX_ASPECT_RATIO)
            ),
            w,
        };
    }
    if (aspectRatio < PREVIEW_MIN_ASPECT_RATIO) {
        return {
            h: Math.max(
                PREVIEW_MIN_HEIGHT,
                Math.round(w * PREVIEW_MIN_ASPECT_RATIO)
            ),
            w,
        };
    }
    return dimensions;
}
