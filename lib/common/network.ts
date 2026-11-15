/**
 * Based on https://github.com/sindresorhus/is-network-error/blob/main/index.js
 */

const ERROR_MESSAGES = new Set<string>([
    "network error", // Chrome
    "NetworkError when attempting to fetch resource.", // Firefox
    "The Internet connection appears to be offline.", // Safari 16
    "Network request failed", // `cross-fetch`
    "fetch failed", // Undici (Node.js)
    "terminated", // Undici (Node.js)
    " A network error occurred.", // Bun (WebKit)
    "Network connection lost", // Cloudflare Workers (fetch)
    "network connection was lost",
    "network request failed",
    "load failed",
    "failed to fetch",
    "econnreset",
    "econnrefused",
    "etimedout",
    "socket hang up",
]);
const BUN_NETWORK_ERROR_MESSAGES = new Set<string>([
    "Unable to connect. Is the computer able to access the url?",
    "The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()",
]);

const isError = (value: unknown): value is Error =>
    Object.prototype.toString.call(value) === "[object Error]";

export function isNetworkError(error: unknown): error is Error {
    if (!isError(error) || typeof error.message !== "string") {
        return false;
    }

    const { message, stack } = error;

    if (
        error.name === "Error" &&
        (BUN_NETWORK_ERROR_MESSAGES.has(message) ||
            message.startsWith("Malformed_HTTP_Response fetching "))
    ) {
        return true;
    }

    if (error.name !== "TypeError") {
        return false;
    }

    // Safari 17+ has generic message but no stack for network errors
    if (
        message === "Load failed" ||
        (message.startsWith("Load failed (") && message.endsWith(")"))
    ) {
        return stack === undefined;
    }

    if (message.startsWith("error sending request for url")) {
        return true;
    }

    // Chrome may append the hostname to its standard message.
    if (
        message === "Failed to fetch" ||
        (message.startsWith("Failed to fetch (") && message.endsWith(")"))
    ) {
        return true;
    }

    return ERROR_MESSAGES.has(message);
}
