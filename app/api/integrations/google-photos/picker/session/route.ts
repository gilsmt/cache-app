import { requireRouteUserId } from "@/lib/auth/session";
import {
    eachProviderAccountAccess,
    resolveProviderAccountAccessToken,
} from "@/lib/integrations/account";
import { IntegrationApiError } from "@/lib/integrations/error";
import {
    createPickerSession,
    getPickerSession,
} from "@/lib/integrations/google-photos/api";
import { mapPickerSessionToViewModel } from "@/lib/integrations/google-photos/service";
import {
    GOOGLE_PHOTOS_PERMISSION_MESSAGE,
    GOOGLE_PHOTOS_PICKER_SCOPE,
} from "@/lib/integrations/google-photos/shared";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };

function photosAuthErrorResponse(error: IntegrationApiError): Response {
    const status = error.data.status ?? 500;
    const message =
        status === 401 || status === 403
            ? GOOGLE_PHOTOS_PERMISSION_MESSAGE
            : error.message;
    return Response.json({ error: message }, { status });
}

function isPhotosAuthFailure(error: unknown): error is IntegrationApiError {
    return (
        IntegrationApiError.isInstance(error) &&
        error.data.integrationId === "google-photos" &&
        (error.data.status === 401 || error.data.status === 403)
    );
}

export async function POST() {
    const sessionResult = await requireRouteUserId();
    if (sessionResult instanceof Response) {
        return sessionResult;
    }
    const { userId } = sessionResult;

    let lastPhotosAuthError: IntegrationApiError | null = null;

    for await (const access of eachProviderAccountAccess({
        providerId: "google",
        requiredScope: GOOGLE_PHOTOS_PICKER_SCOPE,
        userId,
    })) {
        try {
            const pickerSession = await createPickerSession(access.accessToken);
            return Response.json(
                mapPickerSessionToViewModel(pickerSession, access.accountId)
            );
        } catch (error) {
            if (isPhotosAuthFailure(error)) {
                lastPhotosAuthError = error;
                continue;
            }
            if (
                IntegrationApiError.isInstance(error) &&
                error.data.integrationId === "google-photos"
            ) {
                return photosAuthErrorResponse(error);
            }
            throw error;
        }
    }

    if (lastPhotosAuthError) {
        return photosAuthErrorResponse(lastPhotosAuthError);
    }

    return Response.json(
        { error: "Missing Google access token. Reconnect Google first." },
        { status: 403 }
    );
}

export async function GET(request: Request) {
    const sessionResult = await requireRouteUserId();
    if (sessionResult instanceof Response) {
        return sessionResult;
    }
    const { userId } = sessionResult;

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
        return Response.json(
            { error: "Missing session id" },
            { headers: NO_STORE_HEADERS, status: 400 }
        );
    }

    const accountId = url.searchParams.get("accountId");
    if (!accountId) {
        return Response.json(
            { error: "Missing account id" },
            { headers: NO_STORE_HEADERS, status: 400 }
        );
    }

    const accessToken = await resolveProviderAccountAccessToken({
        accountId,
        providerId: "google",
        userId,
    });
    if (!accessToken) {
        return Response.json(
            { error: "Missing Google access token. Reconnect Google first." },
            { headers: NO_STORE_HEADERS, status: 403 }
        );
    }

    try {
        const pickerSession = await getPickerSession(accessToken, id);
        return Response.json(
            mapPickerSessionToViewModel(pickerSession, accountId),
            { headers: NO_STORE_HEADERS }
        );
    } catch (error) {
        if (
            IntegrationApiError.isInstance(error) &&
            error.data.integrationId === "google-photos"
        ) {
            return photosAuthErrorResponse(error);
        }
        throw error;
    }
}
