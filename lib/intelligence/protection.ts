import "server-only";

import type { ArcjetDecision, ArcjetNextRequest } from "@arcjet/next";
import arcjet, { tokenBucket } from "@arcjet/next";
import { serverEnv } from "@/env/server";
import type { PriceType } from "@/lib/billing/prices";
import { GEN_AI_QUOTAS } from "@/lib/billing/quotas";
import { getUserPlanType } from "@/lib/billing/service";
import { createLogger } from "@/lib/common/logs/console/logger";
import { GenAiProtectionError } from "@/lib/intelligence/error";

const log = createLogger("intelligence:protection");

const CHARACTERISTIC_USER_ID = "userId";

function createPlanClient(plan: PriceType, key: string) {
    const quota = GEN_AI_QUOTAS[plan];

    return arcjet({
        characteristics: [CHARACTERISTIC_USER_ID],
        key,
        rules: [
            tokenBucket({
                capacity: quota.fixedLimit,
                characteristics: [CHARACTERISTIC_USER_ID],
                interval: quota.rollingWindow,
                mode: "LIVE",
                refillRate: quota.rollingLimit,
            }),
        ],
    });
}

function denialReason(decision: ArcjetDecision) {
    if (decision.reason.isRateLimit()) {
        return "quota_exceeded";
    }
    return "forbidden";
}

function denialMessage(reason: ReturnType<typeof denialReason>): string {
    switch (reason) {
        case "quota_exceeded":
            return "Your AI usage quota has been reached. Please try again later.";
        default:
            return "The AI request was blocked.";
    }
}

export function isGenAILimitError(
    error: unknown
): error is InstanceType<typeof GenAiProtectionError> {
    return (
        GenAiProtectionError.isInstance(error) &&
        error.data.reason === "quota_exceeded"
    );
}

export async function protectGenAiRequest(args: {
    feature: string;
    request: ArcjetNextRequest;
    requestedTokens: number;
    userId: string;
}): Promise<void> {
    const { feature, request, requestedTokens, userId } = args;

    if (!serverEnv.ARCJET_KEY) {
        log.warn(
            "Skipping Gen AI Arcjet protection because ARCJET_KEY is not configured",
            { feature, userId }
        );
        return;
    }

    const plan = await getUserPlanType(userId);
    const decision = await createPlanClient(plan, serverEnv.ARCJET_KEY).protect(
        request,
        { requested: requestedTokens, userId }
    );

    if (!decision.isDenied()) {
        return;
    }

    const reason = denialReason(decision);
    log.warn("Gen AI request denied by Arcjet", {
        conclusion: decision.conclusion,
        feature,
        plan,
        reason,
        requestedTokens,
        userId,
    });

    throw new GenAiProtectionError({
        feature,
        message: denialMessage(reason),
        operation: "protectGenAiRequest",
        plan,
        reason,
        requestedTokens,
        userId,
    });
}
