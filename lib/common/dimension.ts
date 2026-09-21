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
const PREVIEW_MAX_IMAGE_SIDE_PX = 32_768;
const IMAGE_SIDE_INTEGER_PATTERN = /^\d+$/;

export interface DimensionsCache {
    dimensions: (src: string, dimensions: Dimensions) => void;
    pinDefaultIfMissing: (src: string) => Dimensions;
    readCached: (src: string | null) => Dimensions | null;
    resolveFromServer: (src: string) => Promise<Dimensions | null>;
}

export function createDimensionsCache(): DimensionsCache {
    const previewDimensionsCache = new Map<string, Dimensions>();
    const serverDimensionsInflight = new Map<
        string,
        Promise<Dimensions | null>
    >();

    function readCached(src: string | null): Dimensions | null {
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

    function pinDefaultIfMissing(src: string): Dimensions {
        const existing = previewDimensionsCache.get(src);
        if (existing !== undefined) {
            return existing;
        }
        cacheDimensions(src, DEFAULT_DIMENSIONS);
        return DEFAULT_DIMENSIONS;
    }

    function resolveFromServer(src: string): Promise<Dimensions | null> {
        const cached = previewDimensionsCache.get(src);
        if (cached !== undefined) {
            return Promise.resolve(cached);
        }
        const inflight = serverDimensionsInflight.get(src);
        if (inflight !== undefined) {
            return inflight;
        }
        const pending = fetchPreviewDimensions(src).then(
            (dimensions) => {
                if (dimensions === null) {
                    // Pin a default so virtualized remounts skip refetching missing dims.
                    pinDefaultIfMissing(src);
                    return dimensions;
                }
                cacheDimensions(src, dimensions);
                return dimensions;
            },
            () => {
                pinDefaultIfMissing(src);
                return null;
            }
        );
        const tracked = pending.finally(() => {
            if (serverDimensionsInflight.get(src) === tracked) {
                serverDimensionsInflight.delete(src);
            }
        });
        tracked.catch(() => undefined);
        serverDimensionsInflight.set(src, tracked);
        return tracked;
    }

    return {
        dimensions: cacheDimensions,
        pinDefaultIfMissing,
        readCached,
        resolveFromServer,
    };
}

async function fetchPreviewDimensions(src: string): Promise<Dimensions | null> {
    if (!src.startsWith("/api/preview?")) {
        return null;
    }
    let response: Response;
    try {
        response = await fetch(`${src}&metadata=1`, {
            headers: { Accept: "application/json" },
        });
    } catch {
        return null;
    }
    if (!response.ok) {
        return null;
    }
    let data: unknown;
    try {
        data = await response.json();
    } catch {
        return null;
    }
    if (typeof data !== "object" || data === null) {
        return null;
    }
    return parseImageDimensions(
        "width" in data ? data.width : undefined,
        "height" in data ? data.height : undefined
    );
}

/** The aspect slot to render: cached dimensions when known, else the default, clamped to masonry bounds. */
export function resolveDisplayDimensions(
    dimensions: Dimensions | null
): Dimensions {
    return clampDimensions(dimensions ?? DEFAULT_DIMENSIONS);
}

export function parseImageDimensions(
    width: unknown,
    height: unknown
): Dimensions | null {
    const w = parseImageSide(width);
    const h = parseImageSide(height);
    if (w === null || h === null) {
        return null;
    }
    return { h, w };
}

function parseImageSide(value: unknown): number | null {
    if (typeof value === "number") {
        return isUsableImageSide(value) ? value : null;
    }
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    if (!IMAGE_SIDE_INTEGER_PATTERN.test(trimmed)) {
        return null;
    }
    const parsed = Number(trimmed);
    return isUsableImageSide(parsed) ? parsed : null;
}

function isUsableImageSide(value: number): boolean {
    return (
        Number.isInteger(value) &&
        value > 0 &&
        value <= PREVIEW_MAX_IMAGE_SIDE_PX
    );
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
