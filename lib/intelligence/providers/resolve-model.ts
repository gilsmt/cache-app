import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { gateway, type LanguageModel } from "ai";
import { serverEnv } from "@/env/server";
import { createLogger } from "@/lib/common/logs/console/logger";
import { GenAiConfigurationError } from "../error";
import {
    MODEL_REF_PATTERN,
    MODEL_REFS,
    type ModelRef,
    parseModelRef,
} from "./model-refs";

const log = createLogger("intelligence:providers");

const google = createGoogleGenerativeAI({ apiKey: serverEnv.GEMINI_API_KEY });

/**
 * Runtime validation for vendor-qualified model references arriving from
 * environment configuration. Returns null for anything malformed.
 */
function parseModelRefValue(value: string): ModelRef | null {
    return MODEL_REF_PATTERN.test(value) ? (value as ModelRef) : null;
}

function parseFallbackModelRefs(value: string | undefined): ModelRef[] {
    if (!value) {
        return [];
    }
    return value
        .split(",")
        .map((ref) => {
            const model = parseModelRefValue(ref.trim());
            if (!model && ref.trim().length > 0) {
                log.warn(
                    "Ignoring invalid model reference in CACHE_AI_FALLBACK_MODELS",
                    {
                        value: ref.trim(),
                    }
                );
            }
            return model;
        })
        .filter((ref): ref is ModelRef => ref !== null);
}

/**
 * Effective model fallback chain. Self-hosters override the chain with
 * CACHE_AI_MODEL and CACHE_AI_FALLBACK_MODELS; the cloud deployment uses the
 * hardcoded Gemini chain.
 */
export function resolveModelRefChain(): ModelRef[] {
    const override = serverEnv.CACHE_AI_MODEL
        ? parseModelRefValue(serverEnv.CACHE_AI_MODEL)
        : null;

    if (!override) {
        return [...MODEL_REFS];
    }

    const chain = [
        override,
        ...parseFallbackModelRefs(serverEnv.CACHE_AI_FALLBACK_MODELS),
    ];
    log.debug("Using self-hosted AI model override chain", {
        modelRefs: chain,
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
export function resolveLanguageModel(
    ref: ModelRef,
    operation: string
): LanguageModel {
    const parsed = parseModelRef(ref);
    if (!parsed) {
        throw new GenAiConfigurationError({
            message: `Invalid model reference: ${ref}`,
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
