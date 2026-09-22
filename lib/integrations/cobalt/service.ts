import * as z from "zod";
import { serverEnv } from "@/env/server";
import { isAbortError } from "@/lib/common/abort";
import { createLogger } from "@/lib/common/logs/console/logger";

const log = createLogger("integrations:cobalt");

const COBALT_NOT_CONFIGURED_ERROR_CODE = "cobalt.not_configured";
const COBALT_NOT_CONFIGURED_MESSAGE =
    "Media resolution is temporarily unavailable.";

/**
 * Base URL of the Cobalt media resolver. Resolution stays disabled until the
 * deployment sets one, so the app never posts to a host it does not control.
 */
function cobaltApiBase(): string | null {
    return serverEnv.COBALT_API_BASE ?? null;
}

function warnResolverNotConfigured(): void {
    log.warn("Cobalt media resolver is not configured", {
        envVar: "COBALT_API_BASE",
    });
}

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

    const base = cobaltApiBase();
    if (!base) {
        warnResolverNotConfigured();
        return {
            message: COBALT_NOT_CONFIGURED_MESSAGE,
            status: "ERROR",
        };
    }

    try {
        const response = await fetch(`${base}/`, {
            body: JSON.stringify({ url: normalizedUrl }),
            cache: "no-store",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            method: "POST",
        });

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
    | "unavailable"
    | "other";

export function classifyCobaltError(
    code: CobaltErrorCode | null | undefined
): CobaltErrorCategory {
    if (!code) {
        return "other";
    }
    if (code === COBALT_NOT_CONFIGURED_ERROR_CODE) {
        return "unavailable";
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

function normalizeCobaltMediaUrl(url: string, base: string): string {
    return new URL(url, base).href;
}

function previewFromDirectUrl(
    url: string,
    base: string
): Extract<ResolveCobaltPreviewResult, { status: "SUCCESS" }> {
    const sourceUrl = normalizeCobaltMediaUrl(url, base);
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
    picker: NonNullable<CobaltResponse["picker"]>,
    base: string
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
                ? normalizeCobaltMediaUrl(candidate.thumb, base)
                : null,
            url: candidate.url
                ? normalizeCobaltMediaUrl(candidate.url, base)
                : null,
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
    data: CobaltResponse,
    base: string
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
        return previewFromPicker(data.picker ?? [], base);
    }

    if (
        (data.status === "redirect" ||
            data.status === "tunnel" ||
            data.status === "stream") &&
        data.url
    ) {
        return previewFromDirectUrl(data.url, base);
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

    const base = cobaltApiBase();
    if (!base) {
        warnResolverNotConfigured();
        return {
            errorCode: COBALT_NOT_CONFIGURED_ERROR_CODE,
            message: COBALT_NOT_CONFIGURED_MESSAGE,
            status: "ERROR",
        };
    }

    try {
        const response = await fetch(`${base}/`, {
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
                return resolveCobaltPreviewFromResponse(data, base);
            }

            return {
                errorCode: `http_${response.status}`,
                message:
                    "The media resolver is currently unavailable right now.",
                status: "ERROR",
            };
        }

        return resolveCobaltPreviewFromResponse(data ?? {}, base);
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
