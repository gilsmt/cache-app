"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { usePathname } from "next/navigation";
import type * as React from "react";
import { normalizePathname } from "@/lib/common/url";

/** Splits a route href from its query or hash. */
const HREF_SUFFIX_RE = /[?#]/;

interface ActivePathnameProps extends useRender.ComponentProps<"div"> {
    /**
     * Route that should be considered active.
     *
     * Compared against the pathname Next.js exposes through `usePathname()`,
     * including any locale or base path handling configured by the app. Any
     * query or hash on the value is ignored, so Link-style hrefs work as-is.
     */
    href: string;
    /**
     * Matching strategy for `href`.
     *
     * Use `prefix` for section-level navigation items where descendants should
     * stay active, such as `/settings` matching `/settings/profile`. The
     * section item then also reports `aria-current="page"` on those routes.
     */
    match?: "exact" | "prefix";
    /**
     * Inverts only the `data-active` flag.
     *
     * `aria-current` still follows the real pathname match so assistive
     * technology receives the semantic current-page state. This is useful for
     * styling inactive alternatives without lying to accessibility APIs.
     */
    shouldReverseActive?: boolean;
}

/**
 * Adds accessible pathname-aware states to a rendered element.
 */
export function ActivePathname({
    href,
    match = "exact",
    shouldReverseActive,
    render,
    ...props
}: ActivePathnameProps) {
    const pathname = usePathname();

    const isActive = isPathnameActive(pathname, href, match);
    const isDataActive = shouldReverseActive ? !isActive : isActive;

    const defaultProps: React.AriaAttributes & { "data-active"?: "true" } = {
        "aria-current": isActive ? "page" : undefined,
        "data-active": isDataActive ? "true" : undefined,
    };

    return useRender({
        defaultTagName: "div",
        props: mergeProps<"div">(defaultProps, props),
        render,
    });
}

function isPathnameActive(
    pathname: string,
    href: string,
    match: "exact" | "prefix"
): boolean {
    const separatorIndex = href.search(HREF_SUFFIX_RE);
    const bareHref =
        separatorIndex === -1 ? href : href.slice(0, separatorIndex);
    if (bareHref === "") {
        // A query- or hash-only value (`#section`) does not address a route.
        return false;
    }
    const normalizedPathname = normalizePathname(pathname);
    const normalizedHref = normalizePathname(bareHref);

    if (match === "prefix") {
        if (normalizedHref === "/") {
            return normalizedPathname === "/";
        }
        return (
            normalizedPathname === normalizedHref ||
            normalizedPathname.startsWith(`${normalizedHref}/`)
        );
    }

    return normalizedPathname === normalizedHref;
}
