import * as z from "zod";
import { requireRouteUserId } from "@/lib/auth/session";
import { resolveProviderAccountAccessToken } from "@/lib/integrations/account";
import { IntegrationApiError } from "@/lib/integrations/error";
import {
    deletePickerSession,
    getPickerSession,
    listPickedMediaItems,
} from "@/lib/integrations/google-photos/api";
import {
    collectGooglePhotosImportCandidates,
    importGooglePhotosCandidates,
} from "@/lib/integrations/google-photos/service";
import { GOOGLE_PHOTOS_PERMISSION_MESSAGE } from "@/lib/integrations/google-photos/shared";
import { scheduleSmartCollections } from "@/lib/intelligence/schedule";

const bodySchema = z.object({
    accountId: z.string().min(1),
    sessionId: z.string().min(1),
});

export async function POST(request: Request) {
    const sessionResult = await requireRouteUserId();
    if (sessionResult instanceof Response) {
        return sessionResult;
    }
    const { userId } = sessionResult;

    const bodyRaw = await request.json().catch(() => null);
    const parsedBody = bodySchema.safeParse(bodyRaw);
    if (!parsedBody.success) {
        return Response.json(
            { error: z.treeifyError(parsedBody.error) },
            { status: 400 }
        );
    }

    const accessToken = await resolveProviderAccountAccessToken({
        accountId: parsedBody.data.accountId,
        providerId: "google",
        userId,
    });
    if (!accessToken) {
        return Response.json(
            { error: "Missing Google access token. Reconnect Google first." },
            { status: 403 }
        );
    }

    try {
        const pickerSession = await getPickerSession(
            accessToken,
            parsedBody.data.sessionId
        );
        if (!pickerSession.mediaItemsSet) {
            return Response.json(
                { error: "Selection is not complete yet." },
                { status: 409 }
            );
        }

        const pickedItems = await listPickedMediaItems(
            accessToken,
            parsedBody.data.sessionId
        );
        const { candidates, skippedCount } =
            collectGooglePhotosImportCandidates(pickedItems);
        const { importedCount, smartCollectionItemIds } =
            await importGooglePhotosCandidates({
                candidates,
                userId,
            });

        await deletePickerSession(accessToken, parsedBody.data.sessionId);

        scheduleSmartCollections(userId, smartCollectionItemIds);

        return Response.json({
            importedCount,
            skippedCount,
            totalPicked: pickedItems.length,
        });
    } catch (error) {
        if (
            IntegrationApiError.isInstance(error) &&
            error.data.integrationId === "google-photos"
        ) {
            const status = error.data.status ?? 500;
            const message =
                status === 401 || status === 403
                    ? GOOGLE_PHOTOS_PERMISSION_MESSAGE
                    : error.message;
            return Response.json({ error: message }, { status });
        }
        throw error;
    }
}
