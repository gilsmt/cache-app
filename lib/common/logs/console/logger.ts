import {
    hasWindow,
    isDevelopment,
    isProduction,
    isTest,
    type RuntimeName,
    runtime,
} from "@/lib/common/environment";
import { formatLogValue } from "@/lib/common/logs/format";

/**
 * LogLevel values define the severity levels for logging
 *
 * DEBUG: Detailed information, typically useful only for diagnosing problems
 * INFO: Confirmation that things are working as expected
 * WARN: Indication that something unexpected happened
 * ERROR: Error events that might still allow the application to continue running
 */
const LOG_LEVEL = {
    DEBUG: "DEBUG",
    ERROR: "ERROR",
    INFO: "INFO",
    WARN: "WARN",
} as const;

type LogLevel = (typeof LOG_LEVEL)[keyof typeof LOG_LEVEL];

interface LogSpan {
    stop: () => void;
    [Symbol.dispose]: () => void;
}

type NodeEnvironment = "development" | "production" | "test";

const DISABLED_LOG_CONFIG = {
    colorize: false,
    enabled: false,
    minLevel: LOG_LEVEL.ERROR,
};

/**
 * Configuration for different environments
 *
 * enabled: Whether logging is enabled at all
 * minLevel: The minimum log level that will be displayed
 *          (e.g., INFO will show INFO, WARN, and ERROR, but not DEBUG)
 * colorize: Whether to apply color formatting to logs
 */
const LOG_CONFIG = {
    development: {
        colorize: true,
        enabled: true,
        minLevel: LOG_LEVEL.DEBUG,
    },
    // Production keeps warnings and errors. No aggregator reads this stream,
    // so the platform log stream is the only surface an operator has. Routes
    // report partial failures they swallow and still return 200 for at WARN,
    // so dropping that level would hide them. The stack is dropped (see
    // stringifyLogValue) and sensitive keys are redacted by formatLogValue.
    production: {
        colorize: false,
        enabled: true,
        minLevel: LOG_LEVEL.WARN,
    },
    test: DISABLED_LOG_CONFIG,
};

type LogConfig = (typeof LOG_CONFIG)[keyof typeof LOG_CONFIG];

const LOG_LEVEL_ORDER = [
    LOG_LEVEL.DEBUG,
    LOG_LEVEL.INFO,
    LOG_LEVEL.WARN,
    LOG_LEVEL.ERROR,
];

const ANSI_RESET = "\u001b[0m";
const ANSI_COLOR_BY_LEVEL: Record<LogLevel, string> = {
    DEBUG: "\u001b[34m",
    ERROR: "\u001b[31m",
    INFO: "\u001b[32m",
    WARN: "\u001b[33m",
};
const ANSI_CYAN = "\u001b[36m";
const ANSI_GRAY = "\u001b[90m";

const getNodeEnvironment = (): NodeEnvironment => {
    if (isProduction) {
        return "production";
    }
    if (isTest) {
        return "test";
    }
    if (isDevelopment) {
        return "development";
    }
    // An unrecognized NODE_ENV falls back to production, so a deployed process
    // never logs below ERROR or attaches error stacks.
    return "production";
};

function getEnvironmentRuntime(): RuntimeName | "" | "browser" {
    if (hasWindow) {
        return "browser";
    }
    return runtime;
}

/**
 * Logging config for the current environment and runtime.
 */
function getLogConfigForEnvironment(): LogConfig {
    const environmentRuntime = getEnvironmentRuntime();
    if (environmentRuntime === "browser") {
        return DISABLED_LOG_CONFIG;
    }
    const nodeEnvironment = getNodeEnvironment();
    return {
        ...LOG_CONFIG[nodeEnvironment],
        colorize:
            nodeEnvironment === "development" && environmentRuntime === "node",
    };
}

function colorizeLogPart(value: string, color: string) {
    return `${color}${value}${ANSI_RESET}`;
}

function stringifyLogValue(value: unknown) {
    try {
        const env = getNodeEnvironment();
        const isDev = env === "development";

        return JSON.stringify(
            formatLogValue(value, { includeErrorStack: isDev }),
            null,
            isDev ? 2 : 0
        );
    } catch {
        return "[Unserializable Object]";
    }
}

/**
 * Logger class for standardized console logging
 *
 * Provides methods for logging at different severity levels
 * and handles formatting, colorization, and environment-specific behavior.
 */
export class Logger {
    readonly #module: string;

    /**
     * Create a new logger for a specific module
     * @param module The name of the module (e.g., 'OpenAIProvider', 'AgentBlockHandler')
     */
    constructor(module: string) {
        this.#module = module;
    }

    #shouldLog(level: LogLevel, config: LogConfig): boolean {
        if (!config.enabled) {
            return false;
        }

        const minLevelIndex = LOG_LEVEL_ORDER.indexOf(config.minLevel);
        const currentLevelIndex = LOG_LEVEL_ORDER.indexOf(level);

        return currentLevelIndex >= minLevelIndex;
    }

    /**
     * Format arguments for logging, converting objects to JSON strings
     */
    #formatArgs(args: unknown[]): unknown[] {
        return args.map((arg) => {
            if (arg === null || arg === undefined) {
                return arg;
            }
            if (typeof arg === "object") {
                return stringifyLogValue(arg);
            }
            return arg;
        });
    }

    /**
     * Internal method to log a message with the specified level
     */
    #log(level: LogLevel, message: string, ...args: unknown[]) {
        const config = getLogConfigForEnvironment();

        if (!this.#shouldLog(level, config)) {
            return;
        }

        const timestamp = new Date().toISOString();
        const prefix = config.colorize
            ? `${colorizeLogPart(`[${timestamp}]`, ANSI_GRAY)} ${colorizeLogPart(`[${level}]`, ANSI_COLOR_BY_LEVEL[level])} ${colorizeLogPart(`[${this.#module}]`, ANSI_CYAN)}`
            : `[${timestamp}] [${level}] [${this.#module}]`;
        const formattedArgs = this.#formatArgs(args);

        switch (level) {
            case LOG_LEVEL.DEBUG:
                console.debug(prefix, message, ...formattedArgs);
                break;
            case LOG_LEVEL.INFO:
                console.info(prefix, message, ...formattedArgs);
                break;
            case LOG_LEVEL.WARN:
                console.warn(prefix, message, ...formattedArgs);
                break;
            case LOG_LEVEL.ERROR:
                console.error(prefix, message, ...formattedArgs);
                break;
            default:
                throw new Error(`Unknown log level: ${level}`);
        }
    }

    /**
     * Log a debug message
     *
     * Use for detailed information useful during development and debugging.
     * These logs are only shown in development environment by default.
     */
    debug(message: string, ...args: unknown[]) {
        this.#log(LOG_LEVEL.DEBUG, message, ...args);
    }

    /**
     * Log an info message
     *
     * Use for general information about application operation.
     */
    info(message: string, ...args: unknown[]) {
        this.#log(LOG_LEVEL.INFO, message, ...args);
    }

    /**
     * Log a warning message
     *
     * Use for potentially problematic situations that don't cause operation failure.
     */
    warn(message: string, ...args: unknown[]) {
        this.#log(LOG_LEVEL.WARN, message, ...args);
    }

    /**
     * Log an error message
     *
     * Use for error events that might still allow the application to continue.
     */
    error(message: string, ...args: unknown[]) {
        this.#log(LOG_LEVEL.ERROR, message, ...args);
    }

    /**
     * Measure and log the duration of an operation.
     * Logs a started event immediately and a completed event with duration on stop.
     *
     * Usage:
     * const span = logger.time("sync invoices", { tenantId })
     * try { ... } finally { span.stop() }
     *
     * With TS 5.2+ you can also use `using` to auto-dispose:
     * using _ = logger.time("sync invoices", { tenantId })
     */
    time(message: string, meta: Record<string, unknown> = {}): LogSpan {
        const start = Date.now();
        this.info(message, { status: "started", ...meta });
        const stop = () => {
            this.info(message, {
                durationMs: Date.now() - start,
                status: "completed",
                ...meta,
            });
        };
        return {
            stop,
            [Symbol.dispose]: stop,
        };
    }
}

/**
 * Create a logger for a specific module
 *
 * @example
 * ```ts
 * import { createLogger } from '@/lib/common/logs/console/logger'
 *
 * const log = createLogger('MyComponent')
 *
 * log.debug('Initializing component', { props })
 * log.info('Component mounted')
 * log.warn('Deprecated prop used', { propName })
 * log.error('Failed to fetch data', error)
 * ```
 *
 * @param module The name of the module
 * @returns A Logger instance
 */
export function createLogger(module: string): Logger {
    return new Logger(module);
}
