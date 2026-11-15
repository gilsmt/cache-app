import { MESSAGE_TYPES } from "@/lib/runtime";

const REQUEST_EVENT = "cache-request-yt-bootstrap";

function readYtCfg(key: string): unknown {
    try {
        const cfg = (
            window as Window & {
                ytcfg?: {
                    get?: (k: string) => unknown;
                    data_?: Record<string, unknown>;
                };
            }
        ).ytcfg;
        if (cfg && typeof cfg.get === "function") {
            return cfg.get(key);
        }
        if (cfg?.data_) {
            return cfg.data_[key];
        }
    } catch {
        return null;
    }
    return null;
}

function publishBootstrap(): void {
    try {
        const initialData = (window as Window & { ytInitialData?: unknown })
            .ytInitialData;
        window.postMessage(
            {
                payload: {
                    apiKey: readYtCfg("INNERTUBE_API_KEY") || null,
                    clientName:
                        readYtCfg("INNERTUBE_CONTEXT_CLIENT_NAME") || null,
                    clientVersion:
                        readYtCfg("INNERTUBE_CONTEXT_CLIENT_VERSION") || null,
                    context: readYtCfg("INNERTUBE_CONTEXT") || null,
                    initialData: initialData || null,
                },
                type: MESSAGE_TYPES.CACHE_YT_BOOTSTRAP,
            },
            window.location.origin
        );
    } catch {
        window.postMessage(
            {
                payload: null,
                type: MESSAGE_TYPES.CACHE_YT_BOOTSTRAP,
            },
            window.location.origin
        );
    }
}

document.documentElement.addEventListener(REQUEST_EVENT, publishBootstrap);
