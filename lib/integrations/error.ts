import * as z from "zod";
import { NamedError } from "@/lib/common/error";
import type { IntegrationId } from "./registry";
import { isIntegrationId } from "./registry";

const IntegrationErrorData = z.object({
    cause: z.unknown().optional(),
    integrationId: z
        .custom<IntegrationId>((value) => isIntegrationId(value))
        .optional(),
    message: z.string(),
    operation: z.string().optional(),
});

/**
 * Discriminator for connection-level failures. Lets transport adapters map a
 * domain failure to a concrete HTTP status (or UI message) without parsing
 * the human-readable `message` field.
 *
 * - `not_connected`: the user has no linked provider account.
 * - `token_missing`: the account is linked but the access token cannot be
 *   resolved (typically a stale better-auth token cache).
 */
export type IntegrationConnectionErrorCode = "not_connected" | "token_missing";

export const IntegrationConnectionError = NamedError.create(
    "IntegrationConnectionError",
    IntegrationErrorData.extend({
        code: z.enum(["not_connected", "token_missing"]).optional(),
    })
);
export type IntegrationConnectionError = InstanceType<
    typeof IntegrationConnectionError
>;

export const IntegrationApiError = NamedError.create(
    "IntegrationApiError",
    IntegrationErrorData.extend({
        status: z.number().optional(),
    })
);
export type IntegrationApiError = InstanceType<typeof IntegrationApiError>;

export const IntegrationUserError = NamedError.create(
    "IntegrationUserError",
    IntegrationErrorData.extend({
        accountId: z.string().optional(),
        capability: z.string().optional(),
        resource: z.string().optional(),
        retryAfter: z.number().optional(),
    })
);
export type IntegrationUserError = InstanceType<typeof IntegrationUserError>;
