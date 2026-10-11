import type { IntegrationApiError } from "@/lib/integrations/error";
import { importGitHubStarredRepositories } from "@/lib/integrations/github/service";
import { runOAuthImport } from "@/lib/integrations/oauth";

function messageForGitHubApiError(error: IntegrationApiError): string {
    if (error.data.status === 401) {
        return "GitHub asked us to reconnect your account before importing stars.";
    }
    if (error.data.status === 403) {
        return "GitHub denied access to your starred repositories. Reconnect GitHub and try again.";
    }
    if (error.data.status === 429) {
        return "GitHub rate-limited the stars import. Please try again shortly.";
    }
    return error.message;
}

export function POST() {
    return runOAuthImport({
        importFn: importGitHubStarredRepositories,
        messages: {
            apiError: messageForGitHubApiError,
            genericError: "Failed to import GitHub starred repositories",
            noToken: "Reconnect GitHub before importing starred repositories.",
            notConnected:
                "Connect GitHub before importing starred repositories.",
        },
        providerId: "github",
    });
}
