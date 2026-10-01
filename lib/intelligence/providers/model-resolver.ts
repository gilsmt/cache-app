import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { gateway, type LanguageModel } from "ai";
import { serverEnv } from "@/env/server";
import { createLogger } from "@/lib/common/logs/console/logger";
import { GenAiConfigurationError } from "../error";
import {
    DEFAULT_REGISTERED_MODEL,
    parseRegisteredModel,
} from "./model-registry";

const log = createLogger("intelligence:providers");

const google = createGoogleGenerativeAI({ apiKey: serverEnv.GEMINI_API_KEY });

/**
 * Resolves the configured vendor-qualified model to an AI SDK language model.
 *
 * Routes through AI Gateway when AI_GATEWAY_API_KEY is present. Otherwise
 * only google/* references resolve directly; any other vendor needs the
 * gateway key, so misconfiguration fails fast with a named error instead of
 * surfacing as a provider error mid-generation.
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

    if (serverEnv.AI_GATEWAY_API_KEY) {
        return gateway(`${model.vendor}/${model.modelId}`);
    }

    if (model.vendor === "google") {
        return google(model.modelId);
    }

    throw new GenAiConfigurationError({
        message: `Model vendor "${model.vendor}" requires AI_GATEWAY_API_KEY.`,
        operation,
    });
}

export function isIntelligenceConfigured(): boolean {
    return !!(serverEnv.GEMINI_API_KEY || serverEnv.AI_GATEWAY_API_KEY);
}
