export interface Usage {
    cacheRead: number;
    cacheWrite: number;
    /** Subset of `cacheWrite` written with 1h retention. Only Anthropic reports this split. */
    cacheWrite1h?: number;
    cost: {
        input: number;
        output: number;
        cacheRead: number;
        cacheWrite: number;
        total: number;
    };
    input: number;
    output: number;
    /**
     * Reasoning/thinking tokens, when the provider reports them. This is a subset of
     * `output`: `output` already includes these tokens. Set to a number (possibly 0) by
     * providers that expose a reasoning breakdown; left undefined by providers that don't.
     */
    reasoning?: number;
    totalTokens: number;
}

export const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string, outputTokenLimit = 0): number {
    return Math.max(
        1,
        Math.ceil(text.length / CHARS_PER_TOKEN) + outputTokenLimit
    );
}

export function calculateContextTokens(usage: Usage): number {
    return (
        usage.totalTokens ||
        usage.input + usage.output + usage.cacheRead + usage.cacheWrite
    );
}

export function emptyUsage(): Usage {
    return {
        cacheRead: 0,
        cacheWrite: 0,
        cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0 },
        input: 0,
        output: 0,
        totalTokens: 0,
    };
}

export function addUsage(left: Usage, right: Usage): Usage {
    return {
        cacheRead: left.cacheRead + right.cacheRead,
        cacheWrite: left.cacheWrite + right.cacheWrite,
        input: left.input + right.input,
        output: left.output + right.output,
        ...(left.cacheWrite1h === undefined && right.cacheWrite1h === undefined
            ? {}
            : {
                  cacheWrite1h:
                      (left.cacheWrite1h ?? 0) + (right.cacheWrite1h ?? 0),
              }),
        ...(left.reasoning === undefined && right.reasoning === undefined
            ? {}
            : { reasoning: (left.reasoning ?? 0) + (right.reasoning ?? 0) }),
        cost: {
            cacheRead: left.cost.cacheRead + right.cost.cacheRead,
            cacheWrite: left.cost.cacheWrite + right.cost.cacheWrite,
            input: left.cost.input + right.cost.input,
            output: left.cost.output + right.cost.output,
            total: left.cost.total + right.cost.total,
        },
        totalTokens: left.totalTokens + right.totalTokens,
    };
}
