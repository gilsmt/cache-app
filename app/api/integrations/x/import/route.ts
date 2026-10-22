import type { IntegrationApiError } from "@/lib/integrations/error";
import { runOAuthImport } from "@/lib/integrations/oauth";
import { importXBookmarks } from "@/lib/integrations/x/service";

function messageForXApiError(error: IntegrationApiError): string {
    if (error.data.status === 401) {
        return "X asked us to reconnect your account before importing bookmarks.";
    }
    if (error.data.status === 429) {
        return "X rate-limited the bookmark import. Please try again shortly.";
    }
    return error.message;
}

export function POST() {
    return runOAuthImport({
        importFn: importXBookmarks,
        integrationId: "x",
        messages: {
            apiError: messageForXApiError,
            genericError: "Failed to import X bookmarks",
            noToken: "Reconnect X before importing bookmarks.",
            notConnected: "Connect X before importing bookmarks.",
        },
    });
}
