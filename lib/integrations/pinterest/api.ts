import "server-only";

import * as z from "zod";
import { parseDate } from "@/lib/common/date";
import { IntegrationApiError } from "@/lib/integrations/error";

const PINTEREST_API_BASE_URL = "https://api.pinterest.com/v5";
const PINTEREST_PAGE_SIZE = 100;
const MAX_BOARD_PAGES = 20;
const MAX_PIN_PAGES_PER_BOARD = 20;

export interface PinterestBoardSummary {
    id: string;
    name: string | null;
    updatedAt: Date | null;
}

export interface PinterestImportablePin {
    caption: string | null;
    externalId: string;
    scrapedAt: Date | null;
    url: string;
}

const PinterestApiErrorSchema = z.object({
    error: z
        .object({
            message: z.string().optional(),
        })
        .optional(),
    message: z.string().optional(),
});

const PinterestPaginatedResponseSchema = z.object({
    bookmark: z.string().nullish(),
    items: z.array(z.unknown()).optional(),
});

const PinterestBoardSchema = z.object({
    created_at: z.string().nullish(),
    id: z.string(),
    name: z.string().nullish(),
    updated_at: z.string().nullish(),
});

const PinterestPinSchema = z.object({
    created_at: z.string().nullish(),
    description: z.string().nullish(),
    id: z.string(),
    link: z.string().nullish(),
    original_link: z.string().nullish(),
    title: z.string().nullish(),
    updated_at: z.string().nullish(),
});

function parsePinterestApiError(
    payload: unknown,
    status: number
): IntegrationApiError {
    const parsed = PinterestApiErrorSchema.safeParse(payload);
    const message =
        parsed.data?.message ||
        parsed.data?.error?.message ||
        `Pinterest API request failed with status ${status}.`;

    return new IntegrationApiError({
        integrationId: "pinterest",
        message,
        operation: "fetchPinterestPage",
        status,
    });
}

async function fetchPinterestPage(
    path: string,
    accessToken: string,
    searchParams: URLSearchParams
): Promise<{ bookmark: string | null; items: unknown[] }> {
    const response = await fetch(
        `${PINTEREST_API_BASE_URL}${path}?${searchParams.toString()}`,
        {
            cache: "no-store",
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
        }
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw parsePinterestApiError(payload, response.status);
    }

    const parsed = PinterestPaginatedResponseSchema.safeParse(payload);
    return {
        bookmark: parsed.data?.bookmark ?? null,
        items: parsed.data?.items ?? [],
    };
}

async function listPinterestCollection(
    path: string,
    accessToken: string,
    maxPages: number
): Promise<unknown[]> {
    const items: unknown[] = [];
    let bookmark: string | null = null;

    for (let page = 0; page < maxPages; page += 1) {
        const searchParams = new URLSearchParams({
            page_size: String(PINTEREST_PAGE_SIZE),
        });
        if (bookmark) {
            searchParams.set("bookmark", bookmark);
        }

        const payload = await fetchPinterestPage(
            path,
            accessToken,
            searchParams
        );
        items.push(...payload.items);

        bookmark = payload.bookmark;
        if (!bookmark || payload.items.length === 0) {
            break;
        }
    }

    return items;
}

function parseBoard(candidate: unknown): PinterestBoardSummary | null {
    const parsed = PinterestBoardSchema.safeParse(candidate);
    if (!parsed.success) {
        return null;
    }

    return {
        id: parsed.data.id,
        name: parsed.data.name ?? null,
        updatedAt:
            parseDate(parsed.data.updated_at) ??
            parseDate(parsed.data.created_at),
    };
}

function parsePin(
    candidate: unknown,
    boardName: string | null
): PinterestImportablePin | null {
    const parsed = PinterestPinSchema.safeParse(candidate);
    if (!parsed.success) {
        return null;
    }

    const record = parsed.data;
    const destinationUrl =
        record.link ||
        record.original_link ||
        `https://www.pinterest.com/pin/${record.id}/`;

    const captionBase = record.title || record.description || null;
    const caption =
        captionBase && boardName
            ? `${captionBase} • ${boardName}`
            : captionBase || boardName;

    return {
        caption: caption ?? null,
        externalId: record.id,
        scrapedAt: parseDate(record.created_at) ?? parseDate(record.updated_at),
        url: destinationUrl,
    };
}

export async function listPinterestBoards(
    accessToken: string
): Promise<PinterestBoardSummary[]> {
    const boards = (
        await listPinterestCollection("/boards", accessToken, MAX_BOARD_PAGES)
    )
        .map(parseBoard)
        .filter((item): item is PinterestBoardSummary => item !== null);

    return boards.sort((a, b) => {
        const left = a.updatedAt?.getTime() ?? 0;
        const right = b.updatedAt?.getTime() ?? 0;
        return right - left;
    });
}

export async function listPinterestBoardPins(
    accessToken: string,
    board: PinterestBoardSummary
): Promise<PinterestImportablePin[]> {
    return (
        await listPinterestCollection(
            `/boards/${encodeURIComponent(board.id)}/pins`,
            accessToken,
            MAX_PIN_PAGES_PER_BOARD
        )
    )
        .map((item) => parsePin(item, board.name))
        .filter((item): item is PinterestImportablePin => item !== null);
}
