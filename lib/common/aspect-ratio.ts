const IMAGE_ASPECT_CACHE_MAX_SIZE = 50;
const IMAGE_PRELOAD_TIMEOUT_MS = 10_000;

const aspectRatioCache = new Map<string, number>();
const inflightPreloads = new Map<string, Promise<number | null>>();

export function peekImageAspect(url: string): number | undefined {
    return aspectRatioCache.get(url);
}

export function forgetImageAspect(url: string): void {
    aspectRatioCache.delete(url);
}

/**
 * Loads an image off-screen and resolves with its natural aspect ratio, or
 * null on failure or timeout. Concurrent calls for the same URL share one
 * request; failures are not cached so transient network errors can retry.
 */
export function preloadImageAspect(url: string): Promise<number | null> {
    const cachedAspectRatio = aspectRatioCache.get(url);
    if (cachedAspectRatio !== undefined) {
        return Promise.resolve(cachedAspectRatio);
    }

    const inflight = inflightPreloads.get(url);
    if (inflight) {
        return inflight;
    }

    const promise = new Promise<number | null>((resolve) => {
        const image = document.createElement("img");
        image.decoding = "async";

        const settle = (aspectRatio: number | null) => {
            window.clearTimeout(timeoutId);
            image.onload = null;
            image.onerror = null;
            inflightPreloads.delete(url);
            resolve(aspectRatio);
        };

        const timeoutId = window.setTimeout(
            () => settle(null),
            IMAGE_PRELOAD_TIMEOUT_MS
        );

        image.onload = () => {
            const { naturalHeight, naturalWidth } = image;
            if (naturalHeight <= 0 || naturalWidth <= 0) {
                settle(null);
                return;
            }
            const aspectRatio = naturalWidth / naturalHeight;
            rememberAspect(url, aspectRatio);
            settle(aspectRatio);
        };
        image.onerror = () => settle(null);
        image.src = url;
    });

    inflightPreloads.set(url, promise);
    return promise;
}

function rememberAspect(url: string, aspectRatio: number): void {
    if (
        !aspectRatioCache.has(url) &&
        aspectRatioCache.size >= IMAGE_ASPECT_CACHE_MAX_SIZE
    ) {
        const oldestKey = aspectRatioCache.keys().next().value;
        if (oldestKey !== undefined) {
            aspectRatioCache.delete(oldestKey);
        }
    }
    aspectRatioCache.set(url, aspectRatio);
}
