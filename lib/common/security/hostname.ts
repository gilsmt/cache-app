const TRAILING_DOTS_PATTERN = /\.+$/;

/** The WHATWG parser brackets IPv6; strip the markers before IP matching. */
export function unwrapIpv6Brackets(host: string): string {
    return host.startsWith("[") && host.endsWith("]")
        ? host.slice(1, -1)
        : host;
}

/** Exact loopback hosts that may use plain HTTP. */
const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set([
    "localhost",
    "127.0.0.1",
    "::1",
]);

/**
 * Exact-match only — `127.0.0.5` and friends are loopback too but belong
 * to `isLoopbackIp` in `./ssrf`.
 */
export function isLoopbackHostname(host: string): boolean {
    return LOOPBACK_HOSTNAMES.has(unwrapIpv6Brackets(host));
}

/** Lowercase, trim, and drop trailing dots so hostname policy sees one shape. */
export function normalizeHostname(host: string): string {
    return host.trim().toLowerCase().replace(TRAILING_DOTS_PATTERN, "");
}

const LOCALHOST_ALIASES: ReadonlySet<string> = new Set([
    "localhost",
    "0.0.0.0",
    "::1",
    "[::1]",
]);

/**
 * Local aliases and loopback-like names that must never be fetched server-side.
 * Suffix matches cover `*.localhost`, `*.local`, and `*.internal`; `*.local`
 * names resolve through LAN multicast rather than public DNS, so their
 * answers never pass through the address checks below. IP-range checks (e.g.
 * `127.0.0.5`) are `isPrivateIp`'s job in `./ssrf`.
 */
export function isLocalhostAlias(host: string): boolean {
    const normalized = normalizeHostname(host);
    if (LOCALHOST_ALIASES.has(normalized)) {
        return true;
    }
    if (normalized.endsWith(".localhost")) {
        return true;
    }
    if (normalized.endsWith(".local")) {
        return true;
    }
    if (normalized.endsWith(".internal")) {
        return true;
    }
    return false;
}
