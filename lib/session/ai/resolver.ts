import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { gateway, type LanguageModel } from "ai";
import { serverEnv } from "@/env/server";
import { createLogger } from "@/lib/common/logs/console/logger";
import { GenAiConfigurationError } from "../error";
import {
    DEFAULT_REGISTERED_MODEL,
    type ParsedRegisteredModel,
    parseRegisteredModel,
} from "./model";

const log = createLogger("intelligence:model");

/**
 * AI Gateway leads for model IDs in its catalog. OpenRouter catalog refs use
 * OpenRouter's own slug format, so they must use the direct OpenRouter adapter.
 */
interface Provider {
    apiKey: string | undefined;
    create: (args: {
        apiKey: string;
        model: ParsedRegisteredModel;
    }) => LanguageModel;
    /** Vendor this provider serves; omitted for vendor-agnostic providers. */
    vendor?: string;
}

const providers: Provider[] = [
    {
        apiKey: serverEnv.AI_GATEWAY_API_KEY,
        create: ({ model }) => gateway(`${model.vendor}/${model.modelId}`),
    },
    {
        apiKey: serverEnv.GEMINI_API_KEY,
        create: ({ apiKey, model }) =>
            createGoogleGenerativeAI({ apiKey })(model.modelId),
        vendor: "google",
    },
    {
        apiKey: serverEnv.OPENROUTER_API_KEY,
        create: ({ apiKey, model }) =>
            createOpenRouter({ apiKey })(model.modelId),
        vendor: "openrouter",
    },
];

interface ResolvedProvider {
    apiKey: string;
    create: (args: {
        apiKey: string;
        model: ParsedRegisteredModel;
    }) => LanguageModel;
}

function resolveProvider(
    model: ParsedRegisteredModel
): ResolvedProvider | undefined {
    for (const provider of providers) {
        if (model.vendor === "openrouter" && provider.vendor !== "openrouter") {
            continue;
        }
        if (
            provider.apiKey &&
            (provider.vendor === undefined || provider.vendor === model.vendor)
        ) {
            return { apiKey: provider.apiKey, create: provider.create };
        }
    }
    return undefined;
}

/**
 * Misconfiguration fails fast with a named error instead of surfacing as a
 * provider error mid-generation.
 */
export function resolveRegisteredModel(operation: string): LanguageModel {
    const registeredModel =
        serverEnv.CACHE_AI_MODEL ?? DEFAULT_REGISTERED_MODEL;

    const model = parseRegisteredModel(registeredModel);
    if (!model) {
        throw new GenAiConfigurationError({
            message: `Invalid model reference: ${registeredModel}`,
            operation,
        });
    }

    if (serverEnv.CACHE_AI_MODEL) {
        log.debug("Using configured AI model", { registeredModel });
    }

    const provider = resolveProvider(model);
    if (!provider) {
        const credentialHint =
            model.vendor === "openrouter"
                ? "OPENROUTER_API_KEY"
                : `AI_GATEWAY_API_KEY or a direct credential for vendor "${model.vendor}"`;
        throw new GenAiConfigurationError({
            message: `No provider available for model "${registeredModel}": set ${credentialHint}.`,
            operation,
        });
    }

    return provider.create({ apiKey: provider.apiKey, model });
}

export function isIntelligenceConfigured(): boolean {
    const registeredModel =
        serverEnv.CACHE_AI_MODEL ?? DEFAULT_REGISTERED_MODEL;
    const model = parseRegisteredModel(registeredModel);

    if (!model) {
        return false;
    }

    return !!resolveProvider(model);
}
