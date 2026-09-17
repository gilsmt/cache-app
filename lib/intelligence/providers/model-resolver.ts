import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { gateway, type LanguageModel } from "ai";
import { serverEnv } from "@/env/server";
import { createLogger } from "@/lib/common/logs/console/logger";
import { GenAiConfigurationError } from "../error";
import {
    MODEL_REGISTRY,
    parseRegisteredModel,
    REGISTERED_MODEL_PATTERN,
    type RegisteredModel,
} from "./model-registry";

const log = createLogger("intelligence:providers");

const google = createGoogleGenerativeAI({ apiKey: serverEnv.GEMINI_API_KEY });

/**
 * Runtime validation for vendor-qualified model references arriving from
 * environment configuration. Returns null for anything malformed.
 */
function parseRegisteredModelValue(value: string): RegisteredModel | null {
    return REGISTERED_MODEL_PATTERN.test(value)
        ? (value as RegisteredModel)
        : null;
}

function parseFallbackRegisteredModels(
    value: string | undefined
): RegisteredModel[] {
    if (!value) {
        return [];
    }
    return value
        .split(",")
        .map((model) => {
            const registeredModel = parseRegisteredModelValue(model.trim());
            if (!registeredModel && model.trim().length > 0) {
                log.warn(
                    "Ignoring invalid model reference in CACHE_AI_FALLBACK_MODELS",
                    {
                        value: model.trim(),
                    }
                );
            }
            return registeredModel;
        })
        .filter((model): model is RegisteredModel => model !== null);
}

/**
 * Effective model fallback chain. Self-hosters override the chain with
 * CACHE_AI_MODEL and CACHE_AI_FALLBACK_MODELS; the cloud deployment uses the
 * hardcoded Gemini chain.
 */
export function resolveRegisteredModelChain(): RegisteredModel[] {
    const override = serverEnv.CACHE_AI_MODEL
        ? parseRegisteredModelValue(serverEnv.CACHE_AI_MODEL)
        : null;

    if (!override) {
        return [...MODEL_REGISTRY];
    }

    const chain = [
        override,
        ...parseFallbackRegisteredModels(serverEnv.CACHE_AI_FALLBACK_MODELS),
    ];
    log.debug("Using self-hosted AI model override chain", {
        registeredModels: chain,
    });
    return chain;
}

/**
 * Resolves a vendor-qualified model reference to an AI SDK language model.
 *
 * Routes through AI Gateway when AI_GATEWAY_API_KEY is present. Otherwise
 * only google/* references resolve directly; any other vendor needs the
 * gateway key, so misconfiguration fails fast with a named error instead of
 * surfacing as a provider error mid-generation.
 */
export function resolveRegisteredModel(
    registeredModel: RegisteredModel,
    operation: string
): LanguageModel {
    const parsed = parseRegisteredModel(registeredModel);
    if (!parsed) {
        throw new GenAiConfigurationError({
            message: `Invalid model reference: ${registeredModel}`,
            operation,
        });
    }

    if (serverEnv.AI_GATEWAY_API_KEY) {
        return gateway(`${parsed.vendor}/${parsed.modelId}`);
    }

    if (parsed.vendor === "google") {
        return google(parsed.modelId);
    }

    throw new GenAiConfigurationError({
        message: `Model vendor "${parsed.vendor}" requires AI_GATEWAY_API_KEY.`,
        operation,
    });
}

export function isIntelligenceConfigured(): boolean {
    return !!(serverEnv.GEMINI_API_KEY || serverEnv.AI_GATEWAY_API_KEY);
}
