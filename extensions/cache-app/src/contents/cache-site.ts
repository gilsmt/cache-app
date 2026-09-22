import type { PlasmoCSConfig } from "plasmo";
import { MESSAGE_TYPES, resolveCacheOrigin } from "@/lib/runtime";

// Matches must be string literals — Plasmo reads them via static analysis.
export const config: PlasmoCSConfig = {
    matches: [
        "https://cachd.app/*",
        "https://www.cachd.app/*",
        "$PLASMO_PUBLIC_CACHE_DEV_SITE_MATCH",
    ],
    run_at: "document_idle",
};

const TOKEN_REQUEST_EVENT = "cache-request-site-token";
const origin = window.location.origin;

function announceExtensionReady(): void {
    try {
        document.documentElement.dataset.cacheExtensionInstalled = "true";
        window.postMessage(
            { type: MESSAGE_TYPES.CACHE_EXTENSION_READY },
            window.location.origin,
        );
        window.dispatchEvent(
            new CustomEvent(MESSAGE_TYPES.CACHE_EXTENSION_READY),
        );
    } catch {
        /* host page may block dataset/postMessage */
    }
}

async function fetchTokenFromContentScriptWorld(): Promise<string> {
    const res = await fetch(`${origin}/api/user/extension-ingest-token`, {
        credentials: "include",
        priority: "low",
    });
    if (!res.ok) {
        return "";
    }
    const data: unknown = await res.json().catch(() => null);
    return data &&
        typeof data === "object" &&
        "token" in data &&
        typeof data.token === "string"
        ? data.token
        : "";
}

function fetchTokenViaPageWorld(): Promise<string> {
    return new Promise((resolve) => {
        function once(event: MessageEvent) {
            if (event.source !== window) {
                return;
            }
            const data = event.data;
            if (!data || typeof data !== "object") {
                return;
            }
            if (
                !("type" in data) ||
                data.type !== MESSAGE_TYPES.CACHE_SITE_TOKEN
            ) {
                return;
            }
            window.removeEventListener("message", once);
            const token =
                "token" in data && typeof data.token === "string"
                    ? data.token.trim()
                    : "";
            resolve(token);
        }

        window.addEventListener("message", once);
        document.documentElement.dispatchEvent(
            new CustomEvent(TOKEN_REQUEST_EVENT),
        );

        setTimeout(() => {
            window.removeEventListener("message", once);
            resolve("");
        }, 1500);
    });
}

async function bridgeTokenToExtension(): Promise<boolean> {
    let token = "";
    try {
        token = (await fetchTokenFromContentScriptWorld()).trim();
    } catch {
        token = "";
    }
    if (!token) {
        token = (await fetchTokenViaPageWorld()).trim();
    }
    if (!token) {
        return false;
    }
    // Background derives per-source paths from a trusted app origin.
    const endpoint = resolveCacheOrigin(origin);
    try {
        await chrome.runtime.sendMessage({
            endpoint,
            token,
            type: MESSAGE_TYPES.CACHE_SITE_BRIDGE,
        });
        return true;
    } catch (err) {
        console.warn("[Cache] extension site bridge send failed:", err);
        return false;
    }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== MESSAGE_TYPES.CACHE_SITE_BRIDGE_REQUEST) {
        return false;
    }
    void bridgeTokenToExtension().then((ok) => sendResponse({ ok }));
    return true;
});

function onOpenAndSyncMessage(event: MessageEvent): void {
    if (event.source !== window) {
        return;
    }
    if (event.origin !== origin) {
        return;
    }
    const data = event.data;
    if (!data || typeof data !== "object") {
        return;
    }
    if (
        !("type" in data) ||
        data.type !== MESSAGE_TYPES.CACHE_SITE_OPEN_AND_SYNC
    ) {
        return;
    }
    const openURL =
        "openURL" in data && typeof data.openURL === "string"
            ? data.openURL.trim()
            : "";
    if (!openURL) {
        return;
    }
    void chrome.runtime
        .sendMessage({
            openURL,
            type: MESSAGE_TYPES.CACHE_SITE_OPEN_AND_SYNC,
        })
        .catch((err) => {
            console.warn("[Cache] open-and-sync forward failed:", err);
        });
}

window.addEventListener("message", onOpenAndSyncMessage);

announceExtensionReady();
void bridgeTokenToExtension();
