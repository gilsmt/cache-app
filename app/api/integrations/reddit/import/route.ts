import type { IntegrationApiError } from "@/lib/integrations/error";
import { runOAuthImport } from "@/lib/integrations/oauth-import/route";
import { importRedditSavedItems } from "@/lib/integrations/reddit/service";

function messageForRedditApiError(error: IntegrationApiError): string {
    if (error.data.status === 401) {
        return "Reddit asked us to reconnect your account before importing saved posts.";
    }
    if (error.data.status === 403) {
        return "Reddit denied access to your saved posts. Reconnect Reddit and allow access to your saved history, then try again.";
    }
    if (error.data.status === 429) {
        return "Reddit rate-limited the saved posts import. Please try again shortly.";
    }
    return error.message;
}

export function POST() {
    return runOAuthImport({
        importFn: importRedditSavedItems,
        messages: {
            apiError: messageForRedditApiError,
            genericError: "Failed to import Reddit saved posts",
            noToken: "Reconnect Reddit before importing saved posts.",
            notConnected: "Connect Reddit before importing saved posts.",
        },
        providerId: "reddit",
    });
}
