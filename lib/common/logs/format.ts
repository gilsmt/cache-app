const SENSITIVE_LOG_KEY_PATTERN =
    /pass|secret|token|key|otp|authorization|cookie/iu;

export const LOG_STRING_MAX_LENGTH = 2000;
export const LOG_ARRAY_SAMPLE_LIMIT = 5;
export const LOG_OBJECT_KEYS_LIMIT = 12;
export const LOG_ERROR_CAUSE_MAX_DEPTH = 5;

const LOG_OBJECT_MAX_DEPTH = 10;
const LOG_VALUE_COUNT_LIMIT = 200;

const REDACTED_LOG_VALUE = "[REDACTED]";
const CIRCULAR_LOG_VALUE = "[Circular]";
const UNREADABLE_PROPERTY_LOG_VALUE = "[Unreadable property value]";
const MAX_CAUSE_DEPTH_EXCEEDED_LOG_VALUE = "[Max cause depth exceeded]";
const MAX_OBJECT_DEPTH_EXCEEDED_LOG_VALUE = "[Max object depth exceeded]";
const MAX_VALUE_COUNT_EXCEEDED_LOG_VALUE = "[Max value count exceeded]";

const ERROR_STANDARD_FIELD_NAMES = new Set([
    "message",
    "name",
    "stack",
    "cause",
]);

type UnsupportedLogValueBehavior = "describe" | "throw";

interface LogValueFormatContext {
    readonly ancestors: WeakSet<object>;
    readonly budget: { remainingValues: number };
    readonly errorCauseDepth: number;
    readonly objectDepth: number;
    readonly options: RequiredLogValueFormatOptions;
}

interface RequiredLogValueFormatOptions {
    readonly formatString: (value: string) => string;
    readonly includeErrorStack: boolean;
    readonly unsupportedValueBehavior: UnsupportedLogValueBehavior;
}

interface LogValueFormatOptions {
    readonly formatString?: (value: string) => string;
    readonly includeErrorStack?: boolean;
    readonly unsupportedValueBehavior?: UnsupportedLogValueBehavior;
}

function formatValueForLog(
    key: string,
    value: unknown,
    context: LogValueFormatContext
): unknown {
    if (context.budget.remainingValues === 0) {
        return MAX_VALUE_COUNT_EXCEEDED_LOG_VALUE;
    }
    context.budget.remainingValues -= 1;

    if (SENSITIVE_LOG_KEY_PATTERN.test(key)) {
        return REDACTED_LOG_VALUE;
    }
    if (typeof value === "string") {
        return context.options.formatString(value);
    }
    if (typeof value === "bigint") {
        return value.toString();
    }
    if (typeof value === "function" || typeof value === "symbol") {
        return formatUnsupportedValueForLog(value, context);
    }
    if (typeof value === "object" && value !== null) {
        return formatObjectForLog(value, context);
    }

    return value;
}

function readFieldForLog(target: object, key: string): unknown {
    try {
        return (target as Record<string, unknown>)[key];
    } catch {
        return UNREADABLE_PROPERTY_LOG_VALUE;
    }
}

function formatFieldForLog(
    target: object,
    key: string,
    context: LogValueFormatContext
): unknown {
    if (
        context.budget.remainingValues === 0 ||
        SENSITIVE_LOG_KEY_PATTERN.test(key)
    ) {
        return formatValueForLog(key, undefined, context);
    }
    return formatValueForLog(key, readFieldForLog(target, key), context);
}

function formatObjectForLog(
    value: object,
    context: LogValueFormatContext
): unknown {
    if (context.ancestors.has(value)) {
        return CIRCULAR_LOG_VALUE;
    }
    if (context.objectDepth >= LOG_OBJECT_MAX_DEPTH) {
        return MAX_OBJECT_DEPTH_EXCEEDED_LOG_VALUE;
    }

    context.ancestors.add(value);
    const childContext: LogValueFormatContext = {
        ...context,
        objectDepth: context.objectDepth + 1,
    };
    try {
        if (value instanceof Error) {
            return formatErrorForLog(value, childContext);
        }

        if (Array.isArray(value)) {
            const sample: unknown[] = [];
            const sampleLength = Math.min(value.length, LOG_ARRAY_SAMPLE_LIMIT);
            for (let index = 0; index < sampleLength; index += 1) {
                if (context.budget.remainingValues === 0) {
                    sample.push(MAX_VALUE_COUNT_EXCEEDED_LOG_VALUE);
                    break;
                }
                sample.push(
                    formatValueForLog(
                        "",
                        readFieldForLog(value, String(index)),
                        childContext
                    )
                );
            }
            return { length: value.length, sample, type: "array" };
        }

        return formatRecordFieldsForLog(value, {}, childContext);
    } finally {
        // Shared references are not cycles once their ancestor path ends.
        context.ancestors.delete(value);
    }
}

function formatRecordFieldsForLog(
    value: object,
    record: Record<string, unknown>,
    context: LogValueFormatContext,
    excludedKeys?: ReadonlySet<string>
): Record<string, unknown> {
    let keptKeys = 0;
    let remainingKeys = 0;
    for (const key of Object.keys(value)) {
        if (excludedKeys?.has(key)) {
            continue;
        }
        if (
            keptKeys >= LOG_OBJECT_KEYS_LIMIT ||
            context.budget.remainingValues === 0
        ) {
            remainingKeys += 1;
            continue;
        }
        record[key] = formatFieldForLog(value, key, context);
        keptKeys += 1;
    }

    if (remainingKeys > 0) {
        record.__truncated__ = `${remainingKeys} more keys`;
    }
    return record;
}

function formatErrorForLog(
    error: Error,
    context: LogValueFormatContext
): Record<string, unknown> {
    const record: Record<string, unknown> = {
        message: formatFieldForLog(error, "message", context),
        name: formatFieldForLog(error, "name", context),
    };

    if (context.options.includeErrorStack) {
        record.stack = formatFieldForLog(error, "stack", context);
    }

    const cause =
        context.budget.remainingValues === 0
            ? undefined
            : readFieldForLog(error, "cause");
    if (cause !== undefined) {
        if (context.errorCauseDepth >= LOG_ERROR_CAUSE_MAX_DEPTH) {
            record.cause = MAX_CAUSE_DEPTH_EXCEEDED_LOG_VALUE;
        } else {
            record.cause = formatValueForLog("cause", cause, {
                ...context,
                errorCauseDepth: context.errorCauseDepth + 1,
            });
        }
    }

    return formatRecordFieldsForLog(
        error,
        record,
        context,
        ERROR_STANDARD_FIELD_NAMES
    );
}

function formatUnsupportedValueForLog(
    value: unknown,
    context: LogValueFormatContext
): string {
    if (context.options.unsupportedValueBehavior === "throw") {
        throw new TypeError(
            `Cannot sanitize ${typeof value} for logging. Only primitives, errors, arrays, and objects are supported.`
        );
    }
    if (typeof value === "function") {
        return "[Function]";
    }
    return typeof value === "symbol" ? value.toString() : String(value);
}

function resolveFormatOptions(
    options: LogValueFormatOptions
): RequiredLogValueFormatOptions {
    return {
        formatString: options.formatString ?? truncateLogString,
        includeErrorStack: options.includeErrorStack ?? true,
        unsupportedValueBehavior:
            options.unsupportedValueBehavior ?? "describe",
    };
}

export function truncateLogString(value: string): string {
    if (value.length <= LOG_STRING_MAX_LENGTH) {
        return value;
    }
    return `${value.slice(0, LOG_STRING_MAX_LENGTH)}... [truncated ${value.length - LOG_STRING_MAX_LENGTH} chars]`;
}

export function formatLogValue(
    value: unknown,
    options: LogValueFormatOptions = {}
): unknown {
    return formatValueForLog("", value, {
        ancestors: new WeakSet(),
        budget: { remainingValues: LOG_VALUE_COUNT_LIMIT },
        errorCauseDepth: 0,
        objectDepth: 0,
        options: resolveFormatOptions(options),
    });
}
