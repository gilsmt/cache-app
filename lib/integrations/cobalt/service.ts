import * as z from "zod";
import { isAbortError } from "@/lib/common/abort";
import { createLogger } from "@/lib/common/logs/console/logger";
import { fetchWithTimeout } from "@/lib/common/timeout";

const log = createLogger("integrations:cobalt");

export const COBALT_API_BASE = "https://preview.cachd.app";

const COBALT_DOWNLOAD_TIMEOUT_MS = 10_000;

const CobaltPickerItemSchema = z.object({
    thumb: z.string().optional(),
    type: z.string().optional(),
    url: z.string().optional(),
});

const CobaltResponseSchema = z.object({
    error: z
        .object({
            code: z.string().optional(),
            context: z.unknown().optional(),
        })
        .optional(),
    picker: z.array(CobaltPickerItemSchema).optional(),
    status: z.string().optional(),
    text: z.string().optional(),
    url: z.string().optional(),
});

type CobaltResponse = z.infer<typeof CobaltResponseSchema>;

type ResolveCobaltDownloadUrlResult =
    | {
          downloadUrl: string;
          status: "SUCCESS";
      }
    | {
          message: string;
          status: "ERROR";
      };

export async function resolveCobaltDownloadUrl(
    url: string
): Promise<ResolveCobaltDownloadUrlResult> {
    const normalizedUrl = url.trim();
    if (normalizedUrl.length === 0) {
        return {
            message: "A valid URL is required to resolve media.",
            status: "ERROR",
        };
    }

    try {
        const response = await fetchWithTimeout(
            `${COBALT_API_BASE}/`,
            {
                body: JSON.stringify({ url: normalizedUrl }),
                cache: "no-store",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                method: "POST",
            },
            COBALT_DOWNLOAD_TIMEOUT_MS
        );

        if (!response.ok) {
            return {
                message: "The media resolver is currently unavailable.",
                status: "ERROR",
            };
        }

        const parsed = CobaltResponseSchema.safeParse(await response.json());
        if (!parsed.success) {
            log.warn("Cobalt download response schema mismatch", {
                error: parsed.error,
            });
            return {
                message: "Invalid response from media resolver.",
                status: "ERROR",
            };
        }

        if (parsed.data.status === "error") {
            return {
                message:
                    parsed.data.text ||
                    "Failed to resolve a media URL for this item.",
                status: "ERROR",
            };
        }

        if (!parsed.data.url) {
            return {
                message:
                    "Could not find a downloadable media URL for this item.",
                status: "ERROR",
            };
        }

        return {
            downloadUrl: parsed.data.url,
            status: "SUCCESS",
        };
    } catch (error) {
        if (isAbortError(error)) {
            return {
                message: "The media resolver took too long to respond.",
                status: "ERROR",
            };
        }

        return {
            message:
                error instanceof Error
                    ? error.message
                    : "Unexpected media resolver failure.",
            status: "ERROR",
        };
    }
}

export type CobaltPreviewMediaType = "gif" | "image" | "unknown" | "video";

export type CobaltErrorCode =
    | "error.api.fetch.fail"
    | "error.api.rate_exceeded"
    | "error.api.unreachable"
    | "error.content.not_found"
    | string;

export type CobaltErrorCategory =
    | "rate_limited"
    | "fetch_failed"
    | "not_found"
    | "other";

export function classifyCobaltError(
    code: CobaltErrorCode | null | undefined
): CobaltErrorCategory {
    if (!code) {
        return "other";
    }
    if (code.includes("rate")) {
        return "rate_limited";
    }
    if (code.includes("not_found")) {
        return "not_found";
    }
    if (code.includes("fetch") || code.includes("unreachable")) {
        return "fetch_failed";
    }
    return "other";
}

type ResolveCobaltPreviewResult =
    | {
          mediaType: CobaltPreviewMediaType;
          sourceUrl: string;
          staticImageUrl: string | null;
          status: "SUCCESS";
          videoPreviewUrl: string | null;
      }
    | {
          errorCode: CobaltErrorCode | null;
          message: string;
          status: "ERROR" | "UNAVAILABLE";
      };

function normalizeCandidateType(
    value: string | undefined
): CobaltPreviewMediaType {
    switch (value) {
        case "gif":
        case "photo":
        case "image":
            return value === "gif" ? "gif" : "image";
        case "video":
            return "video";
        default:
            return "unknown";
    }
}

function normalizeCobaltMediaUrl(url: string): string {
    return new URL(url, COBALT_API_BASE).href;
}

function previewFromDirectUrl(
    url: string
): Extract<ResolveCobaltPreviewResult, { status: "SUCCESS" }> {
    const sourceUrl = normalizeCobaltMediaUrl(url);
    log.debug("sourceUrl", sourceUrl);
    return {
        mediaType: "video",
        sourceUrl,
        staticImageUrl: null,
        status: "SUCCESS",
        videoPreviewUrl: sourceUrl,
    };
}

function previewFromPicker(
    picker: NonNullable<CobaltResponse["picker"]>
): ResolveCobaltPreviewResult {
    interface MappedCandidate {
        mediaType: CobaltPreviewMediaType;
        thumb: string | null;
        url: string | null;
    }

    let videoCandidate: MappedCandidate | undefined;
    let imageCandidate: MappedCandidate | undefined;

    for (const candidate of picker) {
        const mapped: MappedCandidate = {
            mediaType: normalizeCandidateType(candidate.type),
            thumb: candidate.thumb
                ? normalizeCobaltMediaUrl(candidate.thumb)
                : null,
            url: candidate.url ? normalizeCobaltMediaUrl(candidate.url) : null,
        };

        if (!(mapped.url || mapped.thumb)) {
            continue;
        }

        if (
            !videoCandidate &&
            mapped.url &&
            (mapped.mediaType === "video" || mapped.mediaType === "gif")
        ) {
            videoCandidate = mapped;
            break;
        }

        if (
            !imageCandidate &&
            (mapped.mediaType === "image" || mapped.mediaType === "unknown")
        ) {
            imageCandidate = mapped;
        }
    }

    if (videoCandidate?.url) {
        return {
            mediaType: videoCandidate.mediaType,
            sourceUrl: videoCandidate.url,
            staticImageUrl: videoCandidate.thumb,
            status: "SUCCESS",
            videoPreviewUrl: videoCandidate.url,
        };
    }

    const staticImageUrl = imageCandidate?.thumb ?? imageCandidate?.url ?? null;
    if (staticImageUrl) {
        return {
            mediaType: imageCandidate?.mediaType ?? "image",
            sourceUrl: imageCandidate?.url ?? staticImageUrl,
            staticImageUrl,
            status: "SUCCESS",
            videoPreviewUrl: null,
        };
    }

    return {
        errorCode: null,
        message: "Could not find preview media for this item.",
        status: "UNAVAILABLE",
    };
}

export function resolveCobaltPreviewFromResponse(
    data: CobaltResponse
): ResolveCobaltPreviewResult {
    if (data.status === "error") {
        return {
            errorCode: data.error?.code ?? null,
            message:
                data.text || "Failed to resolve preview media for this item.",
            status: "ERROR",
        };
    }

    if (data.status === "local-processing") {
        return {
            errorCode: "local_processing",
            message: "This media requires local processing before previewing.",
            status: "UNAVAILABLE",
        };
    }

    if (data.status === "picker") {
        return previewFromPicker(data.picker ?? []);
    }

    if (
        (data.status === "redirect" ||
            data.status === "tunnel" ||
            data.status === "stream") &&
        data.url
    ) {
        return previewFromDirectUrl(data.url);
    }

    return {
        errorCode: null,
        message: "Could not find preview media for this item.",
        status: "UNAVAILABLE",
    };
}

async function readCobaltJsonResponse(
    response: Response
): Promise<CobaltResponse | null> {
    try {
        const json = await response.json();
        const parsed = CobaltResponseSchema.safeParse(json);
        if (!parsed.success) {
            log.warn("Cobalt preview response schema mismatch", {
                error: parsed.error,
            });
            return null;
        }
        return parsed.data;
    } catch {
        return null;
    }
}

export async function resolveCobaltPreview(
    url: string,
    signal?: AbortSignal
): Promise<ResolveCobaltPreviewResult> {
    const normalizedUrl = url.trim();
    if (normalizedUrl.length === 0) {
        return {
            errorCode: "invalid_url",
            message: "A valid URL is required to resolve media.",
            status: "ERROR",
        };
    }

    try {
        const response = await fetch(`${COBALT_API_BASE}/`, {
            body: JSON.stringify({ url: normalizedUrl }),
            cache: "no-store",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            method: "POST",
            ...(signal ? { signal } : {}),
        });

        const data = await readCobaltJsonResponse(response);

        log.debug("Cobalt response", {
            errorCode: data?.error?.code,
            httpStatus: response.status,
            normalizedUrl,
            responseStatus: data?.status,
            text: data?.text,
            url: data?.url,
        });

        if (!response.ok) {
            if (data?.status === "error") {
                return resolveCobaltPreviewFromResponse(data);
            }

            return {
                errorCode: `http_${response.status}`,
                message:
                    "The media resolver is currently unavailable right now.",
                status: "ERROR",
            };
        }

        return resolveCobaltPreviewFromResponse(data ?? {});
    } catch (error) {
        if (isAbortError(error)) {
            throw error;
        }

        return {
            errorCode: "unexpected",
            message:
                error instanceof Error
                    ? error.message
                    : "Unexpected media resolver failure.",
            status: "ERROR",
        };
    }
}
