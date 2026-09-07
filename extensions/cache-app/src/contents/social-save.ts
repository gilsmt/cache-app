// @ts-nocheck — mechanical port of platform save helpers; message contracts
// are typed via @/lib/runtime.
import type { PlasmoCSConfig } from "plasmo";
import {
    MESSAGE_TYPES,
    isYouTubeWatchLaterUrl,
} from "@/lib/runtime";

export const config: PlasmoCSConfig = {
    matches: [
        "https://www.instagram.com/*",
        "https://www.tiktok.com/*",
        "https://www.youtube.com/*",
    ],
    run_at: "document_idle",
};

/** Enough rounds for large virtualized grids. */
const MAX_SCROLL_ROUNDS = 200;
const SCROLL_SETTLE_MS = 1000;
const STABLE_ROUNDS_NO_NEW_HARD_STOP = 3;
const STABLE_ROUNDS_NO_NEW_AT_BOTTOM = 1;
const STAGNANT_SCROLL_ROUNDS_STOP = 2;
const SCROLL_BOTTOM_SLACK_PX = 56;
const MAX_ITEMS = 2000;
const MAX_YOUTUBE_ITEMS = 10_000;
const INNER_SCROLL_STEPS = 28;
const INNER_SCROLL_STEP_PAUSE_MS = 72;

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms: any) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * @param {HTMLElement | null} inner
 * @returns {boolean}
 */
function isInnerScrolledToBottom(inner: any) {
    if (!inner) {
        return false;
    }
    const { clientHeight, scrollHeight, scrollTop } = inner;
    if (scrollHeight <= clientHeight + 12) {
        return true;
    }
    return scrollTop + clientHeight >= scrollHeight - SCROLL_BOTTOM_SLACK_PX;
}

/**
 * @param {Element | null} start
 * @returns {HTMLElement | null}
 */
function findBestScrollContainer(start: any) {
    let best = /** @type {HTMLElement | null} */ (null);
    let bestRoom = 0;
    let el = start;
    while (el && el !== document.documentElement && el !== document.body) {
        if (el instanceof HTMLElement) {
            const room = el.scrollHeight - el.clientHeight;
            if (room > bestRoom && room > 16) {
                bestRoom = room;
                best = el;
            }
        }
        el = el.parentElement;
    }
    return best;
}

/**
 * @param {Element | null} anchor
 * @param {() => HTMLElement | null} findAnchor
 * @returns {HTMLElement | null}
 */
function findFeedScrollTarget(anchor: any, findAnchor: any) {
    const sample = anchor instanceof HTMLElement ? anchor : findAnchor();
    return findBestScrollContainer(sample);
}

/**
 * @param {Element | null} anchor
 * @param {() => HTMLElement | null} findAnchor
 * @returns {boolean}
 */
function isFeedScrolledToEnd(anchor: any, findAnchor: any) {
    const scroller = findFeedScrollTarget(anchor, findAnchor);
    if (scroller && scroller.scrollHeight > scroller.clientHeight + 16) {
        return isInnerScrolledToBottom(scroller);
    }
    const root = document.scrollingElement ?? document.documentElement;
    return (
        root.scrollTop + root.clientHeight >=
        root.scrollHeight - SCROLL_BOTTOM_SLACK_PX
    );
}

/**
 * @param {Element | null} anchor
 * @param {() => HTMLElement | null} findAnchor
 * @returns {{ scrollTop: number, scrollHeight: number, clientHeight: number }}
 */
function getFeedScrollMetrics(anchor: any, findAnchor: any) {
    const scroller = findFeedScrollTarget(anchor, findAnchor);
    if (scroller && scroller.scrollHeight > scroller.clientHeight + 16) {
        return {
            clientHeight: scroller.clientHeight,
            scrollHeight: scroller.scrollHeight,
            scrollTop: scroller.scrollTop,
        };
    }
    const root = document.scrollingElement ?? document.documentElement;
    return {
        clientHeight: root.clientHeight,
        scrollHeight: root.scrollHeight,
        scrollTop: root.scrollTop,
    };
}

/**
 * @param {{ scrollTop: number, scrollHeight: number, clientHeight: number }} a
 * @param {{ scrollTop: number, scrollHeight: number, clientHeight: number }} b
 * @returns {boolean}
 */
function feedScrollMetricsNearlyEqual(a: any, b: any) {
    const eps = 12;
    return (
        Math.abs(a.scrollTop - b.scrollTop) < eps &&
        Math.abs(a.scrollHeight - b.scrollHeight) < eps &&
        Math.abs(a.clientHeight - b.clientHeight) < eps
    );
}

/**
 * @param {Element | null} start
 */
function scrollAllAncestorsToBottom(start: any) {
    const seen = new WeakSet();
    let el = start;
    while (el) {
        if (el instanceof HTMLElement) {
            const { clientHeight, scrollHeight } = el;
            if (scrollHeight > clientHeight + 24 && !seen.has(el)) {
                seen.add(el);
                el.scrollTop = scrollHeight;
            }
        }
        el = el.parentElement;
    }
}

function scrollWindowToBottom() {
    const root = document.scrollingElement ?? document.documentElement;
    const body = document.body;
    root.scrollTop = root.scrollHeight;
    if (body) {
        body.scrollTop = body.scrollHeight;
    }
    window.scrollTo(0, root.scrollHeight);
}

/**
 * @param {HTMLElement | null} innerScroller
 */
async function stepScrollInnerToBottom(innerScroller: any) {
    if (!innerScroller) {
        return;
    }
    const maxTop = innerScroller.scrollHeight - innerScroller.clientHeight;
    if (maxTop <= 0) {
        return;
    }
    const step = Math.max(120, Math.floor(innerScroller.clientHeight * 0.72));
    for (let i = 0; i < INNER_SCROLL_STEPS; i += 1) {
        if (innerScroller.scrollTop >= maxTop - 2) {
            break;
        }
        innerScroller.scrollTop = Math.min(
            innerScroller.scrollTop + step,
            maxTop
        );
        await sleep(INNER_SCROLL_STEP_PAUSE_MS);
    }
    innerScroller.scrollTop = innerScroller.scrollHeight;
}

/**
 * @param {Element | null} anchor
 * @param {HTMLElement | null} feedScroller
 * @param {{ fullInnerSteps?: boolean }} [opts]
 */
async function scrollFeedTowardBottom(anchor: any, feedScroller: any, opts: any = {}) {
    const fullInner = opts.fullInnerSteps !== false;
    scrollWindowToBottom();
    scrollAllAncestorsToBottom(anchor);
    if (feedScroller) {
        if (fullInner) {
            await stepScrollInnerToBottom(feedScroller);
        }
        feedScroller.scrollTop = feedScroller.scrollHeight;
    }
    window.scrollBy(0, 9e6);
    scrollWindowToBottom();
}

/**
 * @param {Map<string, unknown>} accumulated
 * @param {"instagram" | "tiktok" | "youtube"} source
 */
function flushChunkToExtension(accumulated: any, source: any) {
    if (accumulated.size === 0) {
        return;
    }
    const items = [...accumulated.values()];
    void chrome.runtime
        .sendMessage({
            items,
            source,
            type: MESSAGE_TYPES.BOOKMARKS_CHUNK,
        })
        .catch(() => {
            /* service worker may be restarting */
        });
}

/**
 * Sends only the items added since the previous flush. Each merge function
 * records the keys it touched into {@link delta} so we don't re-serialize the
 * entire history on every scroll round (up to `MAX_YOUTUBE_ITEMS` rows).
 *
 * @param {Map<string, unknown>} accumulated
 * @param {Record<string, true>} delta
 * @param {"instagram" | "tiktok" | "youtube"} source
 */
function flushAccumulatedDelta(accumulated, delta, source) {
    const items = [];
    for (const id of Object.keys(delta)) {
        const row = accumulated.get(id);
        if (row) items.push(row);
    }
    if (items.length === 0) {
        return;
    }
    void chrome.runtime
        .sendMessage({
            items,
            source,
            type: MESSAGE_TYPES.BOOKMARKS_CHUNK,
        })
        .catch(() => {
            /* service worker may be restarting */
        });
}

function textFromRuns(value: any) {
    if (!value || typeof value !== "object") {
        return "";
    }
    if (typeof value.simpleText === "string" && value.simpleText.trim()) {
        return value.simpleText.trim();
    }
    if (Array.isArray(value.runs)) {
        return value.runs
            .map((run) => (run && typeof run.text === "string" ? run.text : ""))
            .join("")
            .trim();
    }
    return "";
}

function walkObjectTree(root: any, visitor: any) {
    const stack = [root];
    const seen = new WeakSet();

    while (stack.length > 0) {
        const value = stack.pop();
        if (!value || typeof value !== "object") {
            continue;
        }
        if (seen.has(value)) {
            continue;
        }
        seen.add(value);
        visitor(value);

        if (Array.isArray(value)) {
            for (const item of value) {
                stack.push(item);
            }
            continue;
        }

        for (const nested of Object.values(value)) {
            stack.push(nested);
        }
    }
}

/**
 * TikTok IDs are Snowflake IDs. The first 32 bits are the Unix timestamp in seconds.
 * @param {string} id
 * @returns {string | null}
 */
function getPostedAtFromTikTokId(id: any) {
    try {
        const bigId = BigInt(id);
        const timestamp = Number(bigId >> 32n) * 1000;
        return new Date(timestamp).toISOString();
    } catch {
        return null;
    }
}

/**
 * Instagram often includes the date in the img alt text in the Saved grid.
 * Example: "Photo by @user on October 25, 2023. May be an image of..."
 * @param {string} alt
 * @returns {string | null}
 */
function getPostedAtFromInstagramAlt(alt: any) {
    if (!alt) {
        return null;
    }
    // English: "on October 25, 2023"
    const enMatch = alt.match(/on\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/);
    if (enMatch?.[1]) {
        const d = new Date(enMatch[1]);
        if (!Number.isNaN(d.getTime())) {
            return d.toISOString();
        }
    }
    // Spanish: "el 25 de octubre de 2023"
    const esMatch = alt.match(/el\s+(\d{1,2}\s+de\s+[a-z]+\s+de\s+\d{4})/i);
    if (esMatch?.[1]) {
        // Simple manual parse for Spanish months if Date() fails
        const months = {
            abril: 3,
            agosto: 7,
            diciembre: 11,
            enero: 0,
            febrero: 1,
            julio: 6,
            junio: 5,
            marzo: 2,
            mayo: 4,
            noviembre: 10,
            octubre: 9,
            septiembre: 8,
        };
        const parts = esMatch[1].toLowerCase().split(/\s+de\s+/);
        if (parts.length === 3) {
            const d = new Date(
                Number(parts[2]),
                months[parts[1]] ?? 0,
                Number(parts[0])
            );
            if (!Number.isNaN(d.getTime())) {
                return d.toISOString();
            }
        }
    }
    return null;
}

/**
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
function normalizeInstagramPostedAtValue(value: any) {
    if (!value) {
        return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }
    return parsed.toISOString();
}

/**
 * @param {Element} start
 * @returns {string | null}
 */
function findInstagramPostedAtFromDom(start: any) {
    const directTime = start.querySelector("time[datetime]");
    if (directTime instanceof HTMLTimeElement) {
        const postedAt = normalizeInstagramPostedAtValue(
            directTime.getAttribute("datetime")
        );
        if (postedAt) {
            return postedAt;
        }
    }

    let current = start;
    while (current && current !== document.body) {
        const timeEl = current.querySelector("time[datetime]");
        if (timeEl instanceof HTMLTimeElement) {
            const postedAt = normalizeInstagramPostedAtValue(
                timeEl.getAttribute("datetime")
            );
            if (postedAt) {
                return postedAt;
            }
        }

        const postLinksInCurrent = current.querySelectorAll(
            'a[href*="/p/"], a[href*="/reel/"]'
        ).length;
        if (postLinksInCurrent > 1) {
            break;
        }
        current = current.parentElement;
    }

    return null;
}

let instagramPostedAtByShortcodeCache = null;

function getInstagramPostedAtByShortcodeMap() {
    if (instagramPostedAtByShortcodeCache) {
        return instagramPostedAtByShortcodeCache;
    }

    /** @type {Map<string, string>} */
    const byShortcode = new Map();
    const scripts = document.querySelectorAll("script");
    const patterns = [
        /"shortcode":"([^"]+)"[\s\S]{0,240}?"taken_at_timestamp":(\d{9,})/g,
        /"taken_at_timestamp":(\d{9,})[\s\S]{0,240}?"shortcode":"([^"]+)"/g,
    ];

    for (const script of scripts) {
        const text = script.textContent ?? "";
        if (
            !(
                text &&
                text.includes("shortcode") &&
                text.includes("taken_at_timestamp")
            )
        ) {
            continue;
        }

        for (const pattern of patterns) {
            pattern.lastIndex = 0;
            for (const match of text.matchAll(pattern)) {
                const shortcode = pattern === patterns[0] ? match[1] : match[2];
                const rawTimestamp =
                    pattern === patterns[0] ? match[2] : match[1];
                if (!shortcode || byShortcode.has(shortcode)) {
                    continue;
                }
                const timestamp = Number(rawTimestamp);
                if (!Number.isFinite(timestamp)) {
                    continue;
                }
                const postedAt = normalizeInstagramPostedAtValue(
                    new Date(timestamp * 1000).toISOString()
                );
                if (postedAt) {
                    byShortcode.set(shortcode, postedAt);
                }
            }
        }
    }

    instagramPostedAtByShortcodeCache = byShortcode;
    return byShortcode;
}

/**
 * @param {HTMLAnchorElement} anchor
 * @param {string} shortcode
 * @param {string} caption
 * @returns {string | null}
 */
function getInstagramPostedAt(anchor: any, shortcode: any, caption: any) {
    const domPostedAt = findInstagramPostedAtFromDom(anchor);
    if (domPostedAt) {
        return domPostedAt;
    }

    const scriptPostedAt = getInstagramPostedAtByShortcodeMap().get(shortcode);
    if (scriptPostedAt) {
        return scriptPostedAt;
    }

    return getPostedAtFromInstagramAlt(caption);
}

// --- Instagram ---

const IG_SAVED_PATH_RE = /^\/[^/]+\/saved(\/.*)?$/;
const IG_POST_PATH_RE = /\/(p|reel)\/([^/?#]+)/;

function isInstagramSavedPageByUrl() {
    return IG_SAVED_PATH_RE.test(window.location.pathname);
}

function isInstagramSavedPageByDomFallback() {
    const selectors = [
        '[aria-label*="Saved" i]',
        '[aria-label*="saved" i]',
        "h1",
        "h2",
    ];
    for (const sel of selectors) {
        for (const el of document.querySelectorAll(sel)) {
            const label = el.getAttribute("aria-label") ?? "";
            const text = (el.textContent ?? "").trim();
            const combined = `${label} ${text}`.trim();
            if (
                (/^saved$/i.test(text) ||
                    /^saved$/i.test(label) ||
                    /\bsaved\b/i.test(combined)) &&
                combined.length < 80
            ) {
                return true;
            }
        }
    }
    return false;
}

function isInstagramSavedPage() {
    if (isInstagramSavedPageByUrl()) {
        return true;
    }
    if (window.location.pathname.includes("/saved")) {
        return true;
    }
    return isInstagramSavedPageByDomFallback();
}

function getInstagramPostLinkRoot() {
    const main = document.querySelector("main");
    return main instanceof HTMLElement ? main : document.documentElement;
}

/**
 * @param {HTMLAnchorElement} anchor
 * @returns {HTMLImageElement | null}
 */
function findInstagramImageForAnchor(anchor: any) {
    const anchorImage = anchor.querySelector("img");
    if (anchorImage instanceof HTMLImageElement) {
        return anchorImage;
    }

    let current = anchor.parentElement;
    while (current && current !== document.body) {
        const postLinksInCurrent = current.querySelectorAll(
            'a[href*="/p/"], a[href*="/reel/"]'
        ).length;
        if (postLinksInCurrent > 1) {
            break;
        }

        const image = current.querySelector("img");
        if (image instanceof HTMLImageElement) {
            return image;
        }
        current = current.parentElement;
    }

    return null;
}

function findInstagramScrollAnchorElement() {
    const sel = 'a[href*="/p/"], a[href*="/reel/"]';
    const main = document.querySelector("main");
    if (main instanceof HTMLElement) {
        const inMain = main.querySelector(sel);
        if (inMain instanceof HTMLElement) {
            return inMain;
        }
    }
    const any = document.querySelector(sel);
    return any instanceof HTMLElement ? any : null;
}

/**
 * @param {string} href
 * @returns {{ shortcode: string, pathname: string } | null}
 */
function parseInstagramPostHref(href: any) {
    try {
        const u = new URL(href, "https://www.instagram.com");
        if (u.hostname.replace(/^www\./, "") !== "instagram.com") {
            return null;
        }
        const match = u.pathname.match(IG_POST_PATH_RE);
        if (!match) {
            return null;
        }
        return { pathname: u.pathname, shortcode: match[2] };
    } catch {
        return null;
    }
}

/** @typedef {{ shortcode: string, url: string, caption: string, postedAt: string | null, savedAt: string }} InstagramRow */

/**
 * @param {Map<string, InstagramRow>} accumulated
 * @param {Record<string, true>=} delta
 */
function mergeInstagramDomIntoAccumulated(accumulated: any, delta: any) {
    const root = getInstagramPostLinkRoot();
    const anchors = root.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');

    for (const a of anchors) {
        if (accumulated.size >= MAX_ITEMS) {
            break;
        }
        if (!(a instanceof HTMLAnchorElement)) {
            continue;
        }
        const href = a.getAttribute("href");
        if (!href) {
            continue;
        }
        const parsed = parseInstagramPostHref(href);
        if (!parsed) {
            continue;
        }

        const img = findInstagramImageForAnchor(a);
        const caption = (
            img?.getAttribute("alt") ??
            a.getAttribute("aria-label") ??
            ""
        ).trim();
        const postedAt = getInstagramPostedAt(a, parsed.shortcode, caption);
        const row = {
            caption,
            postedAt,
            savedAt: new Date().toISOString(),
            shortcode: parsed.shortcode,
            url: `https://www.instagram.com${parsed.pathname}`,
        };

        if (accumulated.has(parsed.shortcode)) {
            const prev = accumulated.get(parsed.shortcode);
            const shouldFillCaption = prev && !prev.caption && !!(caption);
            const shouldFillPostedAt =
                prev && !prev.postedAt && !!(postedAt);
            if (shouldFillCaption || shouldFillPostedAt) {
                accumulated.set(parsed.shortcode, {
                    ...prev,
                    caption: prev.caption || caption,
                    postedAt: prev.postedAt || postedAt,
                });
                if (delta) delta[parsed.shortcode] = true;
            }
        } else {
            accumulated.set(parsed.shortcode, row);
            if (delta) delta[parsed.shortcode] = true;
        }
    }
}

/**
 * @param {string} source
 * @param {() => HTMLElement | null} findAnchor
 * @param {(accumulated: Map<string, any>) => void} mergeDomFn
 * @returns {Promise<Map<string, any>>}
 */
async function scrollFeedToLoadMore(source: any, findAnchor: any, mergeDomFn: any) {
    return scrollFeedToLoadMoreInto(
        new Map(),
        source,
        findAnchor,
        mergeDomFn,
    );
}

/**
 * Like {@link scrollFeedToLoadMore} but seeds {@link accumulated} with rows
 * collected by an earlier non-scrolling phase. The existing map is mutated
 * and returned.
 *
 * @param {Map<string, any>} accumulated
 * @param {string} source
 * @param {() => HTMLElement | null} findAnchor
 * @param {(accumulated: Map<string, any>) => void} mergeDomFn
 */
async function scrollFeedToLoadMoreInto(
    accumulated: any,
    source: any,
    findAnchor: any,
    mergeDomFn: any,
) {
    const cap =
        source === "youtube" ? MAX_YOUTUBE_ITEMS : MAX_ITEMS;
    const initialDelta = Object.create(null);
    mergeDomFn(accumulated, initialDelta);
    flushAccumulatedDelta(accumulated, initialDelta, source);

    let roundsWithoutNewAccumulated = 0;
    let stagnantScrollRounds = 0;

    for (let round = 0; round < MAX_SCROLL_ROUNDS; round += 1) {
        const sizeBeforeRound = accumulated.size;

        const anchor = findAnchor();
        const feedScroller = findFeedScrollTarget(anchor, findAnchor);
        const metricsBefore = getFeedScrollMetrics(anchor, findAnchor);

        const fullInnerSteps = roundsWithoutNewAccumulated < 2;
        await scrollFeedTowardBottom(anchor, feedScroller, { fullInnerSteps });
        await sleep(SCROLL_SETTLE_MS);

        const delta = Object.create(null);
        mergeDomFn(accumulated, delta);
        flushAccumulatedDelta(accumulated, delta, source);

        const grew = accumulated.size > sizeBeforeRound;
        if (grew) {
            roundsWithoutNewAccumulated = 0;
            stagnantScrollRounds = 0;
        } else {
            roundsWithoutNewAccumulated += 1;
            const metricsAfter = getFeedScrollMetrics(findAnchor(), findAnchor);
            if (feedScrollMetricsNearlyEqual(metricsBefore, metricsAfter)) {
                stagnantScrollRounds += 1;
            } else {
                stagnantScrollRounds = 0;
            }

            const atEnd = isFeedScrolledToEnd(findAnchor(), findAnchor);
            if (
                atEnd &&
                roundsWithoutNewAccumulated >= STABLE_ROUNDS_NO_NEW_AT_BOTTOM
            ) {
                break;
            }
            if (stagnantScrollRounds >= STAGNANT_SCROLL_ROUNDS_STOP) {
                break;
            }
            if (roundsWithoutNewAccumulated >= STABLE_ROUNDS_NO_NEW_HARD_STOP) {
                break;
            }
        }

        if (accumulated.size >= cap) {
            break;
        }
    }

    const finalDelta = Object.create(null);
    mergeDomFn(accumulated, finalDelta);
    flushAccumulatedDelta(accumulated, finalDelta, source);
    return accumulated;
}

/**
 * @returns {Promise<Map<string, InstagramRow>>}
 */
async function scrollInstagramToLoadMore() {
    return scrollFeedToLoadMore(
        "instagram",
        findInstagramScrollAnchorElement,
        mergeInstagramDomIntoAccumulated
    );
}

async function runInstagramSync() {
    if (!isInstagramSavedPage()) {
        await chrome.runtime.sendMessage({
            code: "NOT_SAVED_PAGE",
            message: "Open Instagram → your profile → Saved, then try again.",
            source: "instagram",
            type: MESSAGE_TYPES.SYNC_ERROR,
        });
        return;
    }

    const accumulated = await scrollInstagramToLoadMore();
    const items = [...accumulated.values()];

    if (items.length === 0) {
        await chrome.runtime.sendMessage({
            code: "NO_ITEMS",
            message:
                "No posts found. Scroll the Saved grid manually once, then sync again.",
            source: "instagram",
            type: MESSAGE_TYPES.SYNC_ERROR,
        });
        return;
    }

    await chrome.runtime.sendMessage({
        items,
        source: "instagram",
        type: MESSAGE_TYPES.BOOKMARKS_COMPLETE,
    });
}

// --- TikTok ---

/**
 * TikTok Web often mounts tabs and grids inside **closed** or open shadow roots.
 * Light-DOM `querySelector` misses them, so page detection and saving both fail.
 * @param {string} sel
 * @returns {Element[]}
 */
function querySelectorAllDeep(sel: any) {
    /** @type {Element[]} */
    const out = [];
    /**
     * @param {Document | ShadowRoot | Element} root
     */
    function walk(root: any) {
        if (!root || typeof root.querySelectorAll !== "function") {
            return;
        }
        for (const el of root.querySelectorAll(sel)) {
            out.push(el);
        }
        for (const el of root.querySelectorAll("*")) {
            if (el.shadowRoot) {
                walk(el.shadowRoot);
            }
        }
    }
    walk(document.documentElement);
    return out;
}

/**
 * Strip `/en/`, `/zh-Hans/`, etc. only when the remainder looks like a real TikTok route
 * (avoids mangling paths such as `/establishment`).
 * @param {string} pathname
 * @returns {string}
 */
function tiktokPathWithoutOptionalLocale(pathname: any) {
    const m = pathname.match(/^\/([a-z]{2}(?:-[a-zA-Z0-9]{2,10})?)\/(.+)$/i);
    if (!m) {
        return pathname;
    }
    const rest = `/${m[2]}`;
    if (
        rest.startsWith("/@") ||
        rest.startsWith("/discover") ||
        rest.startsWith("/following") ||
        rest.startsWith("/foryou")
    ) {
        return rest;
    }
    return pathname;
}

/**
 * @returns {string}
 */
function tiktokNormalizedPath() {
    return tiktokPathWithoutOptionalLocale(window.location.pathname);
}

/**
 * Legacy or alternate routes that still put `/favorites` in the path.
 * @returns {boolean}
 */
function isTikTokFavoritesByUrl() {
    const p = tiktokNormalizedPath();
    if (/^\/@[^/]+\/favorites?(?:\/|$)/i.test(p)) {
        return true;
    }
    if (
        /\/favorites?(?:\/|$)/i.test(p) &&
        /@/i.test(window.location.pathname)
    ) {
        return true;
    }
    const sp = new URLSearchParams(window.location.search);
    const tab = (sp.get("tab") ?? sp.get("from_tab") ?? "").toLowerCase();
    if (
        (tab === "favorites" || tab === "favorite") &&
        /^\/@[^/]+\/?$/i.test(p)
    ) {
        return true;
    }
    const hash = window.location.hash.toLowerCase();
    if (
        (hash.includes("favorite") || hash.includes("favorites")) &&
        /^\/@[^/]+\/?$/i.test(p)
    ) {
        return true;
    }
    return false;
}

/**
 * Profile area under a handle — not single-video/photo viewer chrome.
 * Favorites is a client tab, so the path often stays `/@handle` or a sibling segment.
 * @returns {boolean}
 */
function isTikTokProfileSurfacePath() {
    const p = tiktokNormalizedPath();
    if (/^\/profile\b/i.test(p)) {
        return true;
    }
    if (!/^\/@[^/]+/i.test(p)) {
        return false;
    }
    if (/^\/@[^/]+\/(?:video|photo)\/\d+/i.test(p)) {
        return false;
    }
    return true;
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function textSuggestsTikTokFavorites(text: any) {
    const t = text.toLowerCase();
    return (
        /\bfavorites?\b/.test(t) ||
        /\bfavourites?\b/.test(t) ||
        /\bfavoritos?\b/.test(t) ||
        /\bfavoris\b/.test(t) ||
        /\bfavoriten\b/.test(t) ||
        /\b收藏\b/.test(text) ||
        /\bお気に入り\b/.test(text)
    );
}

/**
 * @param {Element} el
 * @returns {boolean}
 */
function tiktokTabLooksSelected(el: any) {
    if (el.getAttribute("aria-selected") === "true") {
        return true;
    }
    if (el.getAttribute("aria-pressed") === "true") {
        return true;
    }
    if (el.getAttribute("aria-current") === "true") {
        return true;
    }
    const cls = el.className;
    const s = typeof cls === "string" ? cls : String(cls);
    return /\bactive\b/i.test(s) || /\bselected\b/i.test(s);
}

/**
 * @param {Element} el
 * @returns {boolean}
 */
function tiktokElementLooksVisible(el: any) {
    const r = el.getBoundingClientRect();
    return (
        r.width > 4 &&
        r.height > 4 &&
        r.bottom > 0 &&
        r.top < window.innerHeight
    );
}

/**
 * Favorites tab selected, favorites list mount, or visible “Favorites” chip near the top.
 * Uses shadow-aware queries (TikTok puts most UI in shadow roots).
 * @returns {boolean}
 */
function isTikTokFavoritesTabActive() {
    const tabLists = querySelectorAllDeep(
        '[role="tablist"], [data-e2e*="tab-list" i], [data-e2e*="tablist" i]'
    );
    const scopes =
        tabLists.length > 0
            ? tabLists
            : /** @type {Element[]} */ ([document.body].filter(Boolean));

    for (const scope of scopes) {
        const tabCandidates = scope.querySelectorAll(
            '[role="tab"], [role="tablist"] button, [data-e2e*="tab" i], a[href*="favorite" i]'
        );
        for (const el of tabCandidates) {
            if (!tiktokTabLooksSelected(el)) {
                continue;
            }
            const label = el.getAttribute("aria-label") ?? "";
            const text = (el.textContent ?? "").trim();
            const href = el.getAttribute("href") ?? "";
            if (
                textSuggestsTikTokFavorites(`${label} ${text}`) ||
                /\/favorites/i.test(href)
            ) {
                return true;
            }
        }
    }

    const favMarkers = querySelectorAllDeep(
        '[data-e2e*="user-favorite" i], [data-e2e*="user-fav" i], [data-e2e*="favorite-list" i], [data-e2e*="fav-list" i], [data-e2e*="favorite" i]'
    );
    for (const el of favMarkers) {
        if (tiktokElementLooksVisible(el)) {
            return true;
        }
    }

    for (const el of querySelectorAllDeep(
        '[role="tab"], button, a[href], div[tabindex="0"], [role="menuitem"]'
    )) {
        if (!tiktokElementLooksVisible(el)) {
            continue;
        }
        const r = el.getBoundingClientRect();
        if (r.top > 420 || r.top < 0) {
            continue;
        }
        const label = el.getAttribute("aria-label") ?? "";
        const text = (el.textContent ?? "").trim();
        if (text.length > 80) {
            continue;
        }
        if (textSuggestsTikTokFavorites(`${label} ${text}`)) {
            return true;
        }
    }

    return false;
}

/**
 * TikTok keeps `/@username` in the URL; Favorites is a client-side tab (no `/favorites` path).
 * We cannot see **closed** shadow roots; if the URL matches profile and deep scan finds video
 * links, allow sync (user must be on Favorites — Posts tab can also match).
 * @returns {boolean}
 */
function isTikTokFavoritesVideosView() {
    if (isTikTokFavoritesByUrl()) {
        return true;
    }
    if (!isTikTokProfileSurfacePath()) {
        return false;
    }
    const videoAnchors = querySelectorAllDeep('a[href*="/video/"]');
    if (videoAnchors.length === 0) {
        return false;
    }
    if (isTikTokFavoritesTabActive()) {
        return true;
    }
    return videoAnchors.length >= 1;
}

function findTikTokVideoScrollAnchor() {
    for (const el of querySelectorAllDeep('a[href*="/video/"]')) {
        if (el instanceof HTMLElement && tiktokElementLooksVisible(el)) {
            return el;
        }
    }
    const first = querySelectorAllDeep('a[href*="/video/"]')[0];
    return first instanceof HTMLElement ? first : null;
}

const TIKTOK_VIDEO_ID_RE = /\/video\/(\d+)/;

/**
 * @param {string} href
 * @returns {{ id: string, url: string } | null}
 */
function parseTikTokVideoHref(href: any) {
    try {
        const u = new URL(href, "https://www.tiktok.com");
        if (u.hostname.replace(/^www\./, "") !== "tiktok.com") {
            return null;
        }
        const match = u.pathname.match(TIKTOK_VIDEO_ID_RE);
        if (!match) {
            return null;
        }
        return { id: match[1], url: u.href.split("#")[0] };
    } catch {
        return null;
    }
}

/** @typedef {{ id: string, url: string, caption: string, savedAt: string }} TikTokRow */

/**
 * @param {Map<string, TikTokRow>} accumulated
 * @param {Record<string, true>=} delta
 */
function mergeTikTokDomIntoAccumulated(accumulated: any, delta: any) {
    const anchors = querySelectorAllDeep('a[href*="/video/"]');

    for (const a of anchors) {
        if (accumulated.size >= MAX_ITEMS) {
            break;
        }
        if (!(a instanceof HTMLAnchorElement)) {
            continue;
        }
        const href = a.getAttribute("href");
        if (!href) {
            continue;
        }
        const parsed = parseTikTokVideoHref(href);
        if (!parsed) {
            continue;
        }

        const scope =
            a.closest("[data-e2e='user-post-item']") ??
            a.closest("article") ??
            a.parentElement ??
            a;
        const img =
            a.querySelector("img") ??
            (scope instanceof Element ? scope.querySelector("img") : null);
        const caption = (
            img?.getAttribute("alt") ??
            a.getAttribute("aria-label") ??
            ""
        ).trim();
        const row = {
            caption,
            id: parsed.id,
            postedAt: getPostedAtFromTikTokId(parsed.id),
            savedAt: new Date().toISOString(),
            url: parsed.url,
        };

        if (!accumulated.has(parsed.id)) {
            accumulated.set(parsed.id, row);
            if (delta) delta[parsed.id] = true;
        } else if (delta) {
            delta[parsed.id] = true;
        }
    }
}

/**
 * @returns {Promise<Map<string, TikTokRow>>}
 */
async function scrollTikTokToLoadMore() {
    return scrollFeedToLoadMore(
        "tiktok",
        findTikTokVideoScrollAnchor,
        mergeTikTokDomIntoAccumulated
    );
}

async function runTikTokSync() {
    if (!isTikTokFavoritesVideosView()) {
        await chrome.runtime.sendMessage({
            code: "NOT_TIKTOK_FAVORITES",
            message:
                "Use your profile URL (/@username or /profile), open the Favorites tab, wait for videos to load, then sync. If this persists, TikTok may be using a view the extension cannot read.",
            source: "tiktok",
            type: MESSAGE_TYPES.SYNC_ERROR,
        });
        return;
    }

    const accumulated = await scrollTikTokToLoadMore();
    const items = [...accumulated.values()];

    if (items.length === 0) {
        await chrome.runtime.sendMessage({
            code: "NO_ITEMS",
            message:
                "No videos found. Scroll the Favorites grid once, then sync again.",
            source: "tiktok",
            type: MESSAGE_TYPES.SYNC_ERROR,
        });
        return;
    }

    await chrome.runtime.sendMessage({
        items,
        source: "tiktok",
        type: MESSAGE_TYPES.BOOKMARKS_COMPLETE,
    });
}

// --- YouTube Watch Later ---

const YT_BOOTSTRAP_MESSAGE = MESSAGE_TYPES.CACHE_YT_BOOTSTRAP;
const YT_BOOTSTRAP_REQUEST_EVENT = "cache-request-yt-bootstrap";
const YT_BROWSE_ENDPOINT = "https://www.youtube.com/youtubei/v1/browse";

/** @typedef {{ availability: string, channelId: string, channelName: string, duration: string, playlistItemId: string, position: number | null, publishedAt: string | null, savedAt: string, title: string, videoId: string, videoUrl: string }} YouTubeWatchLaterItem */

function isYouTubeWatchLaterPage() {
    return isYouTubeWatchLaterUrl(window.location.href);
}

function normalizeYouTubeAvailability(renderer: any, title: any) {
    const normalizedTitle = (title ?? "").trim().toLowerCase();
    if (renderer?.upcomingEventData) {
        return "upcoming";
    }
    if (renderer?.isPlayable === false) {
        if (normalizedTitle.includes("private")) {
            return "private";
        }
        if (normalizedTitle.includes("deleted")) {
            return "deleted";
        }
        return "unavailable";
    }

    let isLive = false;
    walkObjectTree(renderer, (node) => {
        const style =
            typeof node.style === "string" ? node.style.toLowerCase() : "";
        const text = `${textFromRuns(node) || ""} ${
            typeof node.label === "string" ? node.label : ""
        }`
            .trim()
            .toLowerCase();
        if (
            style.includes("live") ||
            text.includes("live") ||
            text.includes("watching")
        ) {
            isLive = true;
        }
    });

    return isLive ? "live" : "available";
}

function readYouTubeContinuationToken(value: any) {
    if (!value || typeof value !== "object") {
        return "";
    }
    if (
        value.continuationEndpoint?.continuationCommand?.token &&
        typeof value.continuationEndpoint.continuationCommand.token === "string"
    ) {
        return value.continuationEndpoint.continuationCommand.token;
    }
    if (
        value.continuationItemRenderer?.continuationEndpoint
            ?.continuationCommand?.token &&
        typeof value.continuationItemRenderer.continuationEndpoint
            .continuationCommand.token === "string"
    ) {
        return value.continuationItemRenderer.continuationEndpoint
            .continuationCommand.token;
    }
    if (
        value.nextContinuationData?.continuation &&
        typeof value.nextContinuationData.continuation === "string"
    ) {
        return value.nextContinuationData.continuation;
    }
    return "";
}

function extractYouTubePlaylistPosition(renderer: any, fallbackIndex: any) {
    const indexText = textFromRuns(renderer?.index);
    const parsed = Number.parseInt(indexText, 10);
    if (Number.isFinite(parsed)) {
        return parsed;
    }
    return Number.isFinite(fallbackIndex) ? fallbackIndex : null;
}

function parseYouTubePlaylistVideoRenderer(renderer: any, fallbackIndex: any) {
    const videoId =
        typeof renderer?.videoId === "string" ? renderer.videoId.trim() : "";
    if (!videoId) {
        return null;
    }

    const title =
        textFromRuns(renderer?.title) || textFromRuns(renderer?.headline) || "";
    const shortBylineRuns = Array.isArray(renderer?.shortBylineText?.runs)
        ? renderer.shortBylineText.runs
        : [];
    const firstBylineRun = shortBylineRuns[0] ?? null;
    const channelName =
        typeof firstBylineRun?.text === "string"
            ? firstBylineRun.text.trim()
            : "";
    const channelId =
        typeof firstBylineRun?.navigationEndpoint?.browseEndpoint?.browseId ===
        "string"
            ? firstBylineRun.navigationEndpoint.browseEndpoint.browseId
            : "";
    const playlistItemId =
        typeof renderer?.playlistSetVideoId === "string"
            ? renderer.playlistSetVideoId
            : typeof renderer?.setVideoId === "string"
              ? renderer.setVideoId
              : "";
    const duration =
        textFromRuns(renderer?.lengthText) ||
        textFromRuns(
            renderer?.thumbnailOverlays?.[0]?.thumbnailOverlayTimeStatusRenderer
                ?.text
        ) ||
        "";

    return {
        availability: normalizeYouTubeAvailability(renderer, title),
        channelId,
        channelName,
        duration,
        playlistItemId,
        position: extractYouTubePlaylistPosition(renderer, fallbackIndex),
        publishedAt: null,
        savedAt: new Date().toISOString(),
        title,
        videoId,
        videoUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    };
}

function extractYouTubeRowsAndTokens(root: any, offset: any = 0) {
    const rows = [];
    const tokens = new Set();

    walkObjectTree(root, (node) => {
        if (node.playlistVideoRenderer) {
            const row = parseYouTubePlaylistVideoRenderer(
                node.playlistVideoRenderer,
                offset + rows.length + 1
            );
            if (row) {
                rows.push(row);
            }
        }

        const token = readYouTubeContinuationToken(node);
        if (token) {
            tokens.add(token);
        }
    });

    return {
        rows,
        tokens: [...tokens],
    };
}

function mergeYouTubeRowsIntoAccumulated(accumulated: any, rows: any) {
    for (const row of rows) {
        if (accumulated.size >= MAX_YOUTUBE_ITEMS) {
            break;
        }

        const prev = accumulated.get(row.videoId);
        if (!prev) {
            accumulated.set(row.videoId, row);
            continue;
        }

        accumulated.set(row.videoId, {
            ...prev,
            ...row,
            availability: row.availability || prev.availability || "available",
            channelId: row.channelId || prev.channelId || "",
            channelName: row.channelName || prev.channelName || "",
            duration: row.duration || prev.duration || "",
            playlistItemId: row.playlistItemId || prev.playlistItemId || "",
            position:
                typeof row.position === "number" ? row.position : prev.position,
            publishedAt: row.publishedAt || prev.publishedAt || null,
            savedAt:
                row.savedAt || prev.savedAt || new Date().toISOString(),
            title: row.title || prev.title || "",
            videoUrl: row.videoUrl || prev.videoUrl || "",
        });
    }
}

async function getYouTubeBootstrapData() {
    return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
            window.removeEventListener("message", onMessage);
            resolve(null);
        }, 1500);

        function onMessage(event: any) {
            if (event.source !== window) {
                return;
            }
            const data = event.data;
            if (
                !data ||
                typeof data !== "object" ||
                data.type !== YT_BOOTSTRAP_MESSAGE
            ) {
                return;
            }

            clearTimeout(timeoutId);
            window.removeEventListener("message", onMessage);
            resolve(data.payload ?? null);
        }

        window.addEventListener("message", onMessage);
        // MAIN-world content script (youtube-main.ts) answers this event.
        document.documentElement.dispatchEvent(
            new CustomEvent(YT_BOOTSTRAP_REQUEST_EVENT),
        );
    });
}

async function fetchYouTubeContinuationPage(token: any, bootstrap: any) {
    if (!(bootstrap?.apiKey && bootstrap?.context)) {
        throw new Error(
            "YouTube page data is missing continuation configuration."
        );
    }

    const response = await fetch(
        `${YT_BROWSE_ENDPOINT}?key=${encodeURIComponent(bootstrap.apiKey)}`,
        {
            body: JSON.stringify({
                context: bootstrap.context,
                continuation: token,
            }),
            credentials: "include",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                ...(bootstrap.clientName
                    ? {
                          "X-YouTube-Client-Name": String(bootstrap.clientName),
                      }
                    : {}),
                ...(bootstrap.clientVersion
                    ? {
                          "X-YouTube-Client-Version": String(
                              bootstrap.clientVersion
                          ),
                      }
                    : {}),
            },
            method: "POST",
        }
    );

    if (!response.ok) {
        throw new Error(
            `YouTube continuation request failed (${response.status}).`
        );
    }

    return response.json();
}

/**
 * Anchor on a rendered playlist video so `findBestScrollContainer` can walk
 * *upward* and locate the actual scrollable ancestor. Anchoring on `ytd-app`
 * (the previous approach) skipped every intermediate container because the
 * walk stops at `<body>`.
 *
 * @returns {HTMLElement | null}
 */
function findYouTubePlaylistScrollAnchor() {
    const renderer = document.querySelector("ytd-playlist-video-renderer");
    if (renderer instanceof HTMLElement) {
        return renderer;
    }
    const list = document.querySelector("ytd-playlist-video-list-renderer");
    return list instanceof HTMLElement ? list : null;
}

/**
 * Reads a single `ytd-playlist-video-renderer` DOM element. Polymer exposes
 * the renderer data via `.data` (same `playlistVideoRenderer` shape that
 * `parseYouTubePlaylistVideoRenderer` already handles); DOM selectors are a
 * fallback when the polymer property is unavailable.
 *
 * @param {Element} el
 * @param {number} fallbackIndex
 * @returns {YouTubeWatchLaterItem | null}
 */
function parseYouTubePlaylistVideoRendererFromDom(el, fallbackIndex) {
    const data = el?.data;
    if (
        data &&
        typeof data === "object" &&
        typeof data.videoId === "string"
    ) {
        return parseYouTubePlaylistVideoRenderer(data, fallbackIndex);
    }

    if (!(el instanceof HTMLElement)) {
        return null;
    }

    const link = el.querySelector("a#video-title, a#video-title-link");
    if (!link) {
        return null;
    }
    const href = link.getAttribute("href") || "";
    const match = href.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
    const videoId = match?.[1];
    if (!videoId) {
        return null;
    }

    const title = (link.textContent || "").trim();
    const channelLink = el.querySelector(
        "a.yt-formatted-string, .ytd-channel-name a",
    );
    const channelName = (channelLink?.textContent || "").trim();
    const channelHref = channelLink?.getAttribute("href") || "";
    const channelMatch =
        channelHref.match(/\/channel\/([a-zA-Z0-9_-]+)/) ||
        channelHref.match(/\/@([^/?#]+)/);
    const channelId = channelMatch?.[1] || "";
    const durationEl = el.querySelector(
        "ytd-thumbnail-overlay-time-status-renderer",
    );
    const duration = (durationEl?.textContent || "").trim();
    const indexEl = el.querySelector("#index");
    const positionText = (indexEl?.textContent || "").trim();
    const positionDigits = positionText.replace(/[^\d]/g, "");
    const position = Number.parseInt(positionDigits, 10);
    const availability = deriveYouTubeAvailabilityFromDom(el, title);

    return {
        availability,
        channelId,
        channelName,
        duration,
        playlistItemId: "",
        position: Number.isFinite(position)
            ? position
            : Number.isFinite(fallbackIndex)
              ? fallbackIndex
              : null,
        publishedAt: null,
        savedAt: new Date().toISOString(),
        title,
        videoId,
        videoUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    };
}

/**
 * Mirrors {@link normalizeYouTubeAvailability} for DOM cues. Watch Later
 * often renders `ytd-playlist-video-renderer` shells for private, deleted,
 * or otherwise unavailable videos; we must not collapse them to "available".
 *
 * @returns {"available" | "private" | "deleted" | "unavailable"}
 */
function deriveYouTubeAvailabilityFromDom(el, title) {
    const normalizedTitle = (title || "").toLowerCase();
    const tokens = [];
    const badgeHosts = el.querySelectorAll(
        [
            "ytd-badge-supported-renderer",
            "ytd-thumbnail-overlay-playability-status-renderer",
            "span#title",
            "#reason",
            ".ytd-video-meta-block",
        ].join(","),
    );
    for (const node of badgeHosts) {
        tokens.push((node.textContent || "").toLowerCase());
    }
    const haystack = `${tokens.join(" ")} ${normalizedTitle}`;

    if (haystack.includes("private")) return "private";
    if (haystack.includes("deleted video") || haystack.includes("deleted"))
        return "deleted";
    const unavailableCue =
        haystack.includes("unavailable") ||
        haystack.includes("video unavailable") ||
        el.querySelector("yt-img-shadow, .yt-core-image") === null;
    if (unavailableCue) return "unavailable";
    return "available";
}

/**
 * @param {Map<string, YouTubeWatchLaterItem>} accumulated
 * @param {Record<string, true>=} delta
 */
function mergeYouTubeDomIntoAccumulated(accumulated: any, delta: any) {
    const renderers = document.querySelectorAll("ytd-playlist-video-renderer");
    for (const el of renderers) {
        if (accumulated.size >= MAX_YOUTUBE_ITEMS) {
            break;
        }
        const row = parseYouTubePlaylistVideoRendererFromDom(
            el,
            accumulated.size + 1,
        );
        if (!row) {
            continue;
        }
        const prev = accumulated.get(row.videoId);
        mergeYouTubeRowsIntoAccumulated(accumulated, [row]);
        if (delta && (!prev || prev !== accumulated.get(row.videoId))) {
            delta[row.videoId] = true;
        }
    }
}

/**
 * Scroll-to-load-more fallback for YouTube Watch Later. YouTube lazy-loads
 * `ytd-playlist-video-renderer` elements as the user scrolls; this loop
 * scrolls the playlist container, waits for new elements to render, then
 * reads them from the DOM. Merges into the existing accumulated map so it
 * picks up whatever the continuation-API path already collected.
 *
 * @param {Map<string, YouTubeWatchLaterItem>} accumulated
 */
async function scrollYouTubePlaylistToLoadMore(accumulated) {
    return scrollFeedToLoadMoreInto(
        accumulated,
        "youtube",
        () => findYouTubePlaylistScrollAnchor() ?? document.documentElement,
        mergeYouTubeDomIntoAccumulated
    );
}

async function runYouTubeWatchLaterSync() {
    if (!isYouTubeWatchLaterPage()) {
        const titleText = (document.title || "").trim();
        const titleHint = /watch later/i.test(titleText)
            ? " The active page looks like Watch Later, but the URL must be /playlist?list=WL."
            : "";
        await chrome.runtime.sendMessage({
            code: "NOT_YOUTUBE_WATCH_LATER",
            message: `Open YouTube Watch Later (/playlist?list=WL) first.${titleHint}`,
            source: "youtube",
            type: MESSAGE_TYPES.SYNC_ERROR,
        });
        return;
    }

    const bootstrap = (await getYouTubeBootstrapData()) as {
        apiKey?: string;
        context?: unknown;
        initialData?: unknown;
    } | null;
    if (!bootstrap?.initialData) {
        await chrome.runtime.sendMessage({
            code: "SAVE_FAILED",
            message:
                "Could not read YouTube playlist data from the page. Reload Watch Later and try again.",
            source: "youtube",
            type: MESSAGE_TYPES.SYNC_ERROR,
        });
        return;
    }

    /** @type {Map<string, YouTubeWatchLaterItem>} */
    const accumulated = new Map();
    const seenTokens = new Set();
    let positionOffset = 0;
    let noNewRounds = 0;

    const initial = extractYouTubeRowsAndTokens(
        bootstrap.initialData,
        positionOffset,
    );
    mergeYouTubeRowsIntoAccumulated(accumulated, initial.rows);
    positionOffset = accumulated.size;
    flushChunkToExtension(accumulated, "youtube");

    const queue = initial.tokens.filter(Boolean);
    initial.tokens.forEach((token) => seenTokens.add(token));

    // Phase 1: Continuation API — fetch pages via YouTube's internal browse
    // endpoint using continuation tokens. Efficient: no scrolling required.
    // Skipped entirely when the initial page data has no continuation token
    // (some Watch Later pages don't); Phase 2 handles the rest.
    while (queue.length > 0 && accumulated.size < MAX_YOUTUBE_ITEMS) {
        const token = queue.shift();
        if (!token || seenTokens.has(`done:${token}`)) {
            continue;
        }

        const sizeBefore = accumulated.size;
        const payload = await fetchYouTubeContinuationPage(token, bootstrap);
        const page = extractYouTubeRowsAndTokens(payload, positionOffset);
        mergeYouTubeRowsIntoAccumulated(accumulated, page.rows);
        positionOffset = accumulated.size;
        flushChunkToExtension(accumulated, "youtube");

        seenTokens.add(`done:${token}`);
        for (const nextToken of page.tokens) {
            if (
                nextToken &&
                !seenTokens.has(nextToken) &&
                !queue.includes(nextToken)
            ) {
                seenTokens.add(nextToken);
                queue.push(nextToken);
            }
        }

        if (accumulated.size === sizeBefore) {
            noNewRounds += 1;
        } else {
            noNewRounds = 0;
        }

        if (
            noNewRounds >= STABLE_ROUNDS_NO_NEW_HARD_STOP &&
            queue.length === 0
        ) {
            break;
        }
    }

    // Phase 2: Scroll-to-load-more fallback. YouTube lazy-loads playlist
    // entries as the user scrolls. When the continuation API is unavailable
    // (no token in the initial data) or exhausted, scroll the playlist
    // container and read the newly-rendered DOM elements.
    if (accumulated.size < MAX_YOUTUBE_ITEMS) {
        await scrollYouTubePlaylistToLoadMore(accumulated);
    }

    if (accumulated.size === 0) {
        await chrome.runtime.sendMessage({
            code: "NO_ITEMS",
            message:
                "No Watch Later videos were found. Let the playlist load, then try again.",
            source: "youtube",
            type: MESSAGE_TYPES.SYNC_ERROR,
        });
        return;
    }

    await chrome.runtime.sendMessage({
        items: [...accumulated.values()],
        source: "youtube",
        type: MESSAGE_TYPES.BOOKMARKS_COMPLETE,
    });
}

// --- Router ---

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== MESSAGE_TYPES.START_SYNC) {
        return undefined;
    }

    sendResponse({ ok: true, started: true });

    (async () => {
        try {
            const host = window.location.hostname.replace(/^www\./, "");
            if (host === "instagram.com") {
                await runInstagramSync();
            } else if (host === "tiktok.com") {
                await runTikTokSync();
            } else if (host === "youtube.com") {
                await runYouTubeWatchLaterSync();
            } else {
                await chrome.runtime.sendMessage({
                    code: "UNSUPPORTED_PAGE",
                    message:
                        "Open Instagram Saved, TikTok Favorites, or YouTube Watch Later in this tab.",
                    type: MESSAGE_TYPES.SYNC_ERROR,
                });
            }
        } catch (err) {
            await chrome.runtime.sendMessage({
                code: "SAVE_FAILED",
                message: err instanceof Error ? err.message : String(err),
                type: MESSAGE_TYPES.SYNC_ERROR,
            });
        }
    })();

    return true;
});

// Tell the service worker the content script is live so it can dispatch a
// pending auto-sync (triggered by clicking "Open" on an integration in the
// Cache web app). The worker matches us by `sender.tab.id` against a marker
// it wrote when it created the tab.
void chrome.runtime
    .sendMessage({ type: MESSAGE_TYPES.CONTENT_SCRIPT_READY })
    .catch(() => {
        /* service worker may be restarting */
    });
