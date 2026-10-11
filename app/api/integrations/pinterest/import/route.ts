import type { IntegrationApiError } from "@/lib/integrations/error";
import { runOAuthImport } from "@/lib/integrations/oauth";
import { importPinterestBoards } from "@/lib/integrations/pinterest/service";

function messageForPinterestApiError(error: IntegrationApiError): string {
    if (error.data.status === 401) {
        return "Pinterest asked us to reconnect your account before importing pins.";
    }
    if (error.data.status === 403) {
        return "Pinterest denied access to boards or pins. Confirm the app has boards:read, pins:read, and user_accounts:read.";
    }
    return error.message;
}

export function POST() {
    return runOAuthImport({
        importFn: importPinterestBoards,
        messages: {
            apiError: messageForPinterestApiError,
            genericError: "Failed to import Pinterest pins",
            noToken: "Reconnect Pinterest before importing pins.",
            notConnected: "Connect Pinterest before importing pins.",
        },
        providerId: "pinterest",
    });
}
