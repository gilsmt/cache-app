import dns from "node:dns/promises";
import * as ipaddr from "ipaddr.js";
import * as z from "zod";
import { TaggedError } from "@/lib/common/error";
import { createLogger } from "@/lib/common/logs/console/logger";

const DEFAULT_DNS_TIMEOUT_MS = 5000;

const MAX_DNS_TIMEOUT_MS = 2_147_483_647;

// `dns.lookup` cannot be cancelled and pins a worker pool thread until the OS
// resolver settles; 2 keeps guarded DNS well under the default pool size (4).
const MAX_CONCURRENT_DNS_LOOKUPS = 2;

const DNS_RESOLVE_OPERATION = "resolveHostAddresses";

const log = createLogger("security/dns");

const DnsLookupErrorData = z.object({
    host: z.string(),
    message: z.string(),
    operation: z.string(),
});

const DnsResolveOptionsErrorData = z.object({
    message: z.string(),
    operation: z.string(),
});

export const DnsTimeoutError = TaggedError.create(
    "DnsTimeoutError",
    DnsLookupErrorData
);
export type DnsTimeoutError = InstanceType<typeof DnsTimeoutError>;

export const DnsEmptyResultError = TaggedError.create(
    "DnsEmptyResultError",
    DnsLookupErrorData
);
export type DnsEmptyResultError = InstanceType<typeof DnsEmptyResultError>;

export const DnsConfigurationError = TaggedError.create(
    "DnsConfigurationError",
    DnsResolveOptionsErrorData
);
export type DnsConfigurationError = InstanceType<typeof DnsConfigurationError>;

/** pinning strips Happy Eyeballs' fallback, so a pinned IPv6 hangs on IPv4-only egress. */
export function preferIpv4(addresses: readonly [string, ...string[]]): string {
    return (
        addresses.find((address) => ipaddr.IPv4.isValid(address)) ??
        addresses[0]
    );
}

export interface ResolvedHost {
    /**
     * Every address the host publishes; a guard must classify all of them
     * (order non-deterministic), not the lucky first.
     */
    addresses: string[];
    /** The address to pin or connect to; caller-narrowing re-applies {@link preferIpv4}. */
    preferred: string;
}

const DnsResolveOptionsSchema = z.object({
    timeoutMs: z
        .number()
        .int()
        .min(1)
        .max(MAX_DNS_TIMEOUT_MS)
        .default(DEFAULT_DNS_TIMEOUT_MS),
});

let activeLookups = 0;

interface WaitingLookup {
    resolve: () => void;
    timer?: NodeJS.Timeout;
}

const waitingLookups: WaitingLookup[] = [];

function acquireLookupSlot(host: string, deadline: number): Promise<void> {
    if (activeLookups < MAX_CONCURRENT_DNS_LOOKUPS) {
        activeLookups += 1;
        return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
            reject(createDnsTimeoutError(host));
            return;
        }
        const waiting: WaitingLookup = { resolve };
        waiting.timer = setTimeout(() => {
            const index = waitingLookups.indexOf(waiting);
            if (index !== -1) {
                waitingLookups.splice(index, 1);
            }
            log.warn("DNS lookup timed out while queued", { host });
            reject(createDnsTimeoutError(host));
        }, remaining);
        waitingLookups.push(waiting);
    });
}

function releaseLookupSlot(): void {
    const nextWaiter = waitingLookups.shift();
    if (nextWaiter === undefined) {
        activeLookups -= 1;
    } else {
        if (nextWaiter.timer !== undefined) {
            clearTimeout(nextWaiter.timer);
        }
        nextWaiter.resolve();
    }
}

function createDnsTimeoutError(host: string): DnsTimeoutError {
    return new DnsTimeoutError({
        host,
        message: `DNS lookup for ${host} timed out`,
        operation: DNS_RESOLVE_OPERATION,
    });
}

/**
 * All addresses a host publishes plus the one worth pinning, within budget.
 * Throws {@link DnsTimeoutError} past the deadline (queue wait included) or
 * {@link DnsEmptyResultError} when the resolver answers with nothing; other
 * resolver failures (`ENOTFOUND`) pass through with their `code` intact.
 * Fail closed is the caller's call.
 */
export async function resolveHostAddresses(
    host: string,
    _options: { timeoutMs?: number } = {}
): Promise<ResolvedHost> {
    const options = DnsResolveOptionsSchema.safeParse(_options);
    if (!options.success) {
        throw new DnsConfigurationError({
            message: `timeoutMs must be an integer between 1 and ${MAX_DNS_TIMEOUT_MS}`,
            operation: DNS_RESOLVE_OPERATION,
        });
    }

    const { timeoutMs } = options.data;
    const deadline = Date.now() + timeoutMs;

    await acquireLookupSlot(host, deadline);
    let timer: NodeJS.Timeout | undefined;

    try {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
            releaseLookupSlot();
            log.warn("DNS timed out before the lookup started", { host });
            throw createDnsTimeoutError(host);
        }

        const lookup = dns.lookup(host, { all: true, verbatim: true });
        // The slot is only handed on when the underlying lookup settles: a
        // timed-out request still pins a worker until the OS resolver answers,
        // so releasing early would oversubscribe the pool past the cap.
        lookup.then(releaseLookupSlot, releaseLookupSlot);

        lookup.catch((error: unknown) => {
            log.warn("DNS lookup failed after settlement", { error, host });
        });

        const resolved = await Promise.race([
            lookup,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                    log.warn("DNS lookup timed out", { host });
                    reject(createDnsTimeoutError(host));
                }, remaining);
            }),
        ]);
        const [firstAddress, ...restAddresses] = resolved.map(
            (entry) => entry.address
        );
        if (firstAddress === undefined) {
            log.warn("DNS lookup returned no addresses", { host });
            throw new DnsEmptyResultError({
                host,
                message: `No addresses for ${host}`,
                operation: DNS_RESOLVE_OPERATION,
            });
        }
        const addresses: [string, ...string[]] = [
            firstAddress,
            ...restAddresses,
        ];
        return {
            addresses,
            // `preferred` applies the IPv4 preference (not resolver order via
            // `verbatim: true`), so the order above stays informational.
            preferred: preferIpv4(addresses),
        };
    } finally {
        clearTimeout(timer);
    }
}
