import * as ipaddr from "ipaddr.js";
import { createLogger } from "@/lib/common/logs/console/logger";
import { tryParseUrl } from "@/lib/common/url";
import {
    isLocalhostAlias,
    normalizeHostname,
    unwrapIpv6Brackets,
} from "./hostname";

const log = createLogger("security/ssrf");

/**
 * The SSRF gate: fail closed on anything that is not public unicast. regexes
 * miss octal/hex IPv4, IPv4-mapped/compatible IPv6, and link-local ranges
 * (including the cloud metadata endpoint `169.254.169.254`), so this relies
 * on ipaddr.js.
 */
export function isPrivateIp(ip: string): boolean {
    const addr = parseIp(ip);
    if (addr === null) {
        return true;
    }

    if (addr.range() !== "unicast") {
        return true;
    }

    if (addr instanceof ipaddr.IPv6) {
        const { parts } = addr;
        const firstSixZero = parts.slice(0, 6).every((part) => part === 0);
        if (firstSixZero) {
            // IPv4-compatible forms (`::a.b.c.d`) embed the address in the
            // last 32 bits while still classifying as unicast.
            const high = parts[6];
            const low = parts[7];
            if (high === undefined || low === undefined) {
                return true;
            }
            const embedded = ipaddr.fromByteArray([
                (high >> 8) & 0xff,
                high & 0xff,
                (low >> 8) & 0xff,
                low & 0xff,
            ]);
            return embedded.range() !== "unicast";
        }
    }

    return false;
}

/**
 * `isValid` and `process` share one parser, and `process` guards its only
 * post-parse conversion with the same predicate the conversion re-checks
 * itself, so with the pinned 2.5.0 a throw on accepted input is impossible
 * (fuzz-verified). Rejected input is the everyday case here: fail closed,
 * silently. The impossible case alone gets recorded, never silently.
 */
function parseIp(ip: string): ipaddr.IPv4 | ipaddr.IPv6 | null {
    try {
        return ipaddr.process(ip);
    } catch {
        if (ipaddr.isValid(ip)) {
            log.warn("SSRF IP parser failed on a valid literal — closed", {
                ip,
            });
        }
        return null;
    }
}

export function isIpLiteral(host: string): boolean {
    return ipaddr.isValid(host);
}

/** 127.0.0.0/8 and ::1 only; other private ranges are `isPrivateIp`'s job. */
export function isLoopbackIp(ip: string): boolean {
    const addr = parseIp(ip);
    return addr !== null && addr.range() === "loopback";
}

/** Blocks private **IP literals** synchronously; DNS names are resolved elsewhere. */
export function isPrivateIpHost(host: string): boolean {
    const clean = unwrapIpv6Brackets(host);
    return isIpLiteral(clean) && isPrivateIp(clean);
}

interface ResolvedHostnameAddress {
    address: string;
}

type ResolveHostnameAddresses = (
    hostname: string
) => Promise<readonly ResolvedHostnameAddress[]>;

/**
 * Returns true for local aliases and IP literals that are not public unicast.
 *
 * Domain names are intentionally not resolved here; fetch boundaries still need
 * DNS-aware checks before opening sockets.
 */
export function isBlockedHostname(hostname: string): boolean {
    const normalized = normalizeHostname(hostname);
    if (!normalized) {
        return true;
    }
    if (isLocalhostAlias(normalized)) {
        return true;
    }
    // Zone-qualified IPv6 literals (`fe80::1%en0`) are never public unicast,
    // and `%` cannot appear in a DNS name, so fail closed instead of letting
    // the host fall through as an unresolvable-looking domain name.
    if (normalized.includes("%")) {
        return true;
    }

    const ipHostname = unwrapIpv6Brackets(normalized);
    if (!isIpLiteral(ipHostname)) {
        return false;
    }

    return isPrivateIp(ipHostname);
}

export function parseHttpUrl(value: string): URL | null {
    const parsed = tryParseUrl(value);
    if (!parsed) {
        return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return null;
    }
    return parsed;
}

/**
 * Returns true when a hostname is a blocked literal/local alias or resolves to
 * at least one blocked address. DNS failures are blocked because callers use
 * this before server-side fetches of user-supplied URLs.
 */
export async function resolvesToBlockedHostname(
    hostname: string,
    resolveHostnameAddresses: ResolveHostnameAddresses
): Promise<boolean> {
    if (isBlockedHostname(hostname)) {
        return true;
    }

    // A public IP literal is its own address: DNS would only echo it back,
    // and `dns.lookup` rejects bracketed IPv6, so a literal needs no lookup.
    if (isIpLiteral(unwrapIpv6Brackets(normalizeHostname(hostname)))) {
        return false;
    }

    try {
        const records = await resolveHostnameAddresses(hostname);
        if (records.length === 0) {
            return true;
        }
        return records.some((record) => isBlockedHostname(record.address));
    } catch {
        return true;
    }
}

/**
 * Preflight-only: parses an absolute HTTP(S) URL and rejects hosts that are
 * local, private, or unresolvable. One DNS snapshot does not authorize a
 * fetch — a hostname can resolve to a private address at connect time — so
 * server fetches of the result must go through the pinned boundary in
 * `./fetch` (`resolvePublicHttpUrl` + `createPinnedAgent`), which
 * re-validates and pins the address when the socket opens. The resolver is
 * injected so browser-safe modules can share the policy without importing
 * Node DNS APIs.
 */
export async function parsePublicHttpUrl(
    value: string,
    resolveHostnameAddresses: ResolveHostnameAddresses
): Promise<URL | null> {
    const parsed = parseHttpUrl(value);
    if (!parsed) {
        return null;
    }

    if (
        await resolvesToBlockedHostname(
            parsed.hostname,
            resolveHostnameAddresses
        )
    ) {
        return null;
    }

    return parsed;
}
