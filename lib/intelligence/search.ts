import { escapeLikePattern } from "@/lib/common/string";
import { tryParseUrl } from "@/lib/common/url";
import type { Prisma } from "@/prisma/client/client";

const WHITESPACE_SPLIT_PATTERN = /\s+/;
const WWW_DOMAIN_PREFIX_PATTERN = /^www\./;

export function buildLibraryTextSearchConditions(
    searchText: string,
    maxTermCount?: number
): Prisma.LibraryItemWhereInput[] {
    const terms = searchText
        .split(WHITESPACE_SPLIT_PATTERN)
        .filter((term) => term.length > 0);

    return terms
        .slice(0, maxTermCount ?? terms.length)
        .map((term): Prisma.LibraryItemWhereInput => {
            const literal = escapeLikePattern(term);
            return {
                OR: [
                    { caption: { contains: literal, mode: "insensitive" } },
                    {
                        noteContentText: {
                            contains: literal,
                            mode: "insensitive",
                        },
                    },
                    { url: { contains: literal, mode: "insensitive" } },
                ],
            };
        });
}

export function buildLibraryDomainCondition(
    domainFilters: string[]
): Prisma.LibraryItemWhereInput | null {
    if (domainFilters.length === 0) {
        return null;
    }

    const uniqueDomains = [
        ...new Set(
            domainFilters
                .map(normalizeDomainFilter)
                .filter((domain) => domain.length > 0)
        ),
    ];

    if (uniqueDomains.length === 0) {
        return { id: { in: [] } };
    }

    const orConditions: Prisma.LibraryItemWhereInput[] = [];
    for (const domain of uniqueDomains) {
        orConditions.push(...buildDomainMatchPredicates(domain));
    }

    return { OR: orConditions };
}

function normalizeDomainFilter(rawDomain: string): string {
    const trimmed = rawDomain.trim().toLowerCase();
    if (trimmed.length === 0) {
        return "";
    }

    const parsed = tryParseUrl(trimmed);
    if (parsed && parsed.hostname.length > 0) {
        return parsed.hostname.replace(WWW_DOMAIN_PREFIX_PATTERN, "");
    }

    const withScheme = tryParseUrl(`https://${trimmed}`);
    if (withScheme && withScheme.hostname.length > 0) {
        return withScheme.hostname.replace(WWW_DOMAIN_PREFIX_PATTERN, "");
    }

    return "";
}

function buildDomainMatchPredicates(
    host: string
): Prisma.LibraryItemWhereInput[] {
    const predicates: Prisma.LibraryItemWhereInput[] = [];
    for (const candidate of [host, `www.${host}`]) {
        predicates.push({ url: { equals: candidate, mode: "insensitive" } });
        predicates.push({
            url: { equals: `http://${candidate}`, mode: "insensitive" },
        });
        predicates.push({
            url: { equals: `https://${candidate}`, mode: "insensitive" },
        });
        for (const prefix of [
            `http://${candidate}/`,
            `http://${candidate}?`,
            `http://${candidate}#`,
            `http://${candidate}:`,
            `https://${candidate}/`,
            `https://${candidate}?`,
            `https://${candidate}#`,
            `https://${candidate}:`,
        ]) {
            predicates.push({
                url: { mode: "insensitive", startsWith: prefix },
            });
        }
    }
    return predicates;
}
