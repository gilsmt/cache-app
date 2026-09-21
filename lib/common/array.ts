export function chunk<T>(items: readonly T[], size: number): T[][] {
    if (!Number.isSafeInteger(size) || size < 1) {
        throw new TypeError(
            `chunk expects a positive integer size, got ${String(size)}.`
        );
    }

    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

export function removeValue<T>(values: readonly T[], value: T): T[] {
    return values.filter((entry) => !isSameValueZero(entry, value));
}

export function toggleValue<T>(values: readonly T[], next: T): T[] {
    return values.includes(next)
        ? values.filter((entry) => !isSameValueZero(entry, next))
        : [...values, next];
}

export function updateById<T extends { id: string }>(
    items: readonly T[],
    id: string,
    updater: (item: T) => T
): T[] {
    return items.map((item) => (item.id === id ? updater(item) : item));
}

export function addUnique<T>(values: T[], value: T): T[] {
    return values.includes(value) ? values : [...values, value];
}

export function unique<T>(values: readonly T[]): T[] {
    return Array.from(new Set(values));
}

export function countBy<T, K extends PropertyKey>(
    items: readonly T[],
    getKey: (item: T) => K
): Partial<Record<K, number>> {
    // Null prototype keeps "__proto__" keys as own counts.
    const counts: Partial<Record<K, number>> = Object.create(null);
    for (const item of items) {
        const key = getKey(item);
        counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
}

export function keyBy<T, K extends PropertyKey>(
    items: readonly T[],
    getKey: (item: T) => K
): Map<K, T> {
    const map = new Map<K, T>();
    for (const item of items) {
        map.set(getKey(item), item);
    }
    return map;
}

export function mergeById<T extends { id: string }>(
    current: readonly T[],
    incoming: readonly T[]
): T[] {
    const incomingById = keyBy(incoming, (item) => item.id);
    const currentIdSet = new Set(current.map((item) => item.id));
    return [
        ...Array.from(incoming.values()).filter(
            (item) => !currentIdSet.has(item.id)
        ),
        ...current.map((item) => incomingById.get(item.id) ?? item),
    ];
}

export async function mapConcurrent<T, R>(
    items: readonly T[],
    fn: (item: T) => Promise<R>,
    concurrency: number
): Promise<R[]> {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
        throw new TypeError(
            `mapConcurrent expects a positive integer concurrency, got ${String(concurrency)}.`
        );
    }

    if (items.length === 0) {
        return [];
    }

    const limit = Math.min(concurrency, items.length);
    const results = new Array<R>(items.length);
    // Shared iterator: each worker pulls the next entry. Entries preserve T
    // under noUncheckedIndexedAccess (unlike items[i]), and undefined slots
    // still reach fn instead of retiring the worker early.
    const iterator = items.entries();
    // Capture the first rejection, stop scheduling new work, and let in-flight
    // calls finish so sibling workers never produce unhandled rejections.
    let hasRejected = false;
    let firstError: unknown;

    async function worker(): Promise<void> {
        for (;;) {
            if (hasRejected) {
                return;
            }
            const next = iterator.next();
            if (next.done) {
                return;
            }
            const [index, item] = next.value;
            try {
                results[index] = await fn(item);
            } catch (error) {
                if (!hasRejected) {
                    hasRejected = true;
                    firstError = error;
                }
                return;
            }
        }
    }

    await Promise.all(Array.from({ length: limit }, () => worker()));
    if (hasRejected) {
        throw firstError;
    }
    return results;
}

function isSameValueZero<T>(first: T, second: T): boolean {
    return first === second || (Number.isNaN(first) && Number.isNaN(second));
}
