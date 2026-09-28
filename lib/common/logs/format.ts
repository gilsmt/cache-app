const SENSITIVE_LOG_KEY_PATTERN =
    /pass|secret|token|key|otp|authorization|cookie/i;

export const LOG_STRING_MAX_LENGTH = 2000;
export const LOG_ARRAY_SAMPLE_LIMIT = 5;
export const LOG_OBJECT_KEYS_LIMIT = 12;

const REDACTED_LOG_VALUE = "[REDACTED]";
const CIRCULAR_LOG_VALUE = "[Circular]";
const UNREADABLE_PROPERTY_LOG_VALUE = "[Unreadable property value]";

const ERROR_STANDARD_FIELD_NAMES = new Set(["message", "name", "stack"]);

type UnsupportedLogValueBehavior = "describe" | "throw";

interface LogValueFormatContext {
    readonly options: RequiredLogValueFormatOptions;
    readonly visitedObjects: WeakSet<object>;
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

function formatObjectForLog(
    value: object,
    context: LogValueFormatContext
): unknown {
    if (context.visitedObjects.has(value)) {
        return CIRCULAR_LOG_VALUE;
    }
    context.visitedObjects.add(value);

    if (value instanceof Error) {
        return formatErrorForLog(value, context);
    }

    if (Array.isArray(value)) {
        return {
            length: value.length,
            sample: value
                .slice(0, LOG_ARRAY_SAMPLE_LIMIT)
                .map((item) => formatValueForLog("", item, context)),
            type: "array",
        };
    }

    const keys = Object.keys(value);
    const record: Record<string, unknown> = {};
    let keptKeys = 0;
    for (const key of keys) {
        if (keptKeys >= LOG_OBJECT_KEYS_LIMIT) {
            break;
        }
        record[key] = formatValueForLog(
            key,
            readFieldForLog(value, key),
            context
        );
        keptKeys += 1;
    }

    const remainingKeys = keys.length - keptKeys;
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
        message: formatValueForLog(
            "message",
            readFieldForLog(error, "message"),
            context
        ),
        name: formatValueForLog(
            "name",
            readFieldForLog(error, "name"),
            context
        ),
    };

    if (context.options.includeErrorStack) {
        record.stack = formatValueForLog(
            "stack",
            readFieldForLog(error, "stack"),
            context
        );
    }

    for (const key of Object.keys(error)) {
        if (ERROR_STANDARD_FIELD_NAMES.has(key)) {
            continue;
        }
        record[key] = formatValueForLog(
            key,
            readFieldForLog(error, key),
            context
        );
    }

    return record;
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
        options: resolveFormatOptions(options),
        visitedObjects: new WeakSet(),
    });
}
