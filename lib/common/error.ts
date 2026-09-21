/**
 * Based on https://github.com/anomalyco/opencode/blob/dev/packages/core/src/util/error.ts
 */
import * as z from "zod";
import { asRecord, isRecord } from "@/lib/common/object";

export abstract class NamedError extends Error {
    abstract readonly data: unknown;
    abstract schema(): z.ZodType;
    abstract toObject(): { name: string; data: unknown };

    static create<Name extends string, Data extends z.ZodType>(
        name: Name,
        data: Data
    ) {
        const schema = z.object({
            data,
            name: z.literal(name),
        });
        type DataInput = z.input<Data>;

        const result = class extends NamedError {
            static readonly Schema = schema;
            readonly data: DataInput;
            override readonly name: Name = name;

            constructor(payload: DataInput, options?: ErrorOptions) {
                const _payload = asRecord(payload);
                const message =
                    typeof _payload?.message === "string"
                        ? _payload.message
                        : name;

                super(message, options);
                this.name = name;
                this.data = payload;
            }

            static isInstance(
                error: unknown
            ): error is InstanceType<typeof result> {
                // Fast reject before the zod parse
                if (!isRecord(error) || error.name !== name) {
                    return false;
                }
                return z.validate(schema, error);
            }

            schema() {
                return schema;
            }

            toObject() {
                return { data: this.data, name };
            }
        };

        Object.defineProperty(result, "name", { value: name });
        return result;
    }

    static readonly Unknown = NamedError.create(
        "UnknownError",
        z.object({
            message: z.string(),
        })
    );
}

export function extractNamedErrorMessage(e: unknown): {
    message: string;
    operation?: string;
} {
    const record = isRecord(e) ? e : undefined;
    const data = record && isRecord(record.data) ? record.data : undefined;

    let errorMessage: string | undefined;
    if (typeof record?.message === "string") {
        errorMessage = record.message;
    } else if (e instanceof Error) {
        errorMessage = e.message;
    }

    return {
        message:
            (typeof data?.message === "string" && data.message) ||
            errorMessage ||
            "Unknown error",
        operation:
            typeof data?.operation === "string" ? data.operation : undefined,
    };
}

/**
 * Extracts a human-readable error message from a variety of error payloads.
 */
export function getErrorMessage(
    value: unknown,
    fallback = "An unexpected error occurred"
): string {
    if (typeof value === "string" && value.length > 0) {
        return value;
    }

    if (value instanceof Error) {
        return value.message;
    }

    if (isRecord(value)) {
        // Better-auth error shape
        if (typeof value.message === "string" && value.message.length > 0) {
            return value.message;
        }

        // Generic API error shape
        if (typeof value.error === "string" && value.error.length > 0) {
            return value.error;
        }

        // Nested data shape
        if (isRecord(value.data)) {
            return getErrorMessage(value.data, fallback);
        }
    }

    return fallback;
}
