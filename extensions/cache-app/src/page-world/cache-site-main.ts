import { MESSAGE_TYPES } from "@/lib/runtime";

const REQUEST_EVENT = "cache-request-site-token";

async function publishToken(): Promise<void> {
    const endpoint = `${window.location.origin}/api/user/extension-ingest-token`;
    try {
        const res = await fetch(endpoint, {
            credentials: "include",
            priority: "low",
        });
        if (!res.ok) {
            return;
        }
        const data: unknown = await res.json().catch(() => null);
        const token =
            data &&
            typeof data === "object" &&
            "token" in data &&
            typeof data.token === "string"
                ? data.token.trim()
                : "";
        if (!token) {
            return;
        }
        window.postMessage(
            { token, type: MESSAGE_TYPES.CACHE_SITE_TOKEN },
            window.location.origin
        );
    } catch (error) {
        // res.ok / missing-token paths above cover signed-out; log anything else.
        console.warn("[Cache] publishToken failed:", error);
    }
}

document.documentElement.addEventListener(REQUEST_EVENT, () => {
    void publishToken();
});
