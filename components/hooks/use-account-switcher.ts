"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
    type DeviceSession,
    useDeviceSessions,
} from "@/components/hooks/queries/use-device-sessions";
import { authClient, useSession } from "@/lib/auth/client";
import type { Session } from "@/lib/auth/session";
import { createLogger } from "@/lib/common/logs/console/logger";

export type AccountMenuError = "add" | "load" | "switch";

const log = createLogger("use-account-switcher");

export function useAccountSwitcher() {
    const router = useRouter();
    const { data: activeSession, refetch } = useSession();

    const [, startAccountChangeTransition] = React.useTransition();
    const [isAddingAccount, startAddAccountTransition] = React.useTransition();
    const [pendingSessionToken, setPendingSessionToken] = React.useState<
        null | string
    >(null);

    const [switchAccountError, setSwitchAccountError] =
        React.useState<unknown>(null);
    const [addAccountError, setAddAccountError] = React.useState<unknown>(null);

    const {
        deviceSessions,
        deviceSessionsError,
        isLoadingDeviceSessions,
        refreshDeviceSessions,
    } = useDeviceSessions(!!activeSession);

    const handleAccountChange = useStableCallback((sessionToken: string) => {
        if (
            !activeSession ||
            pendingSessionToken !== null ||
            sessionToken === activeSession.session.token
        ) {
            return;
        }

        setPendingSessionToken(sessionToken);
        setSwitchAccountError(null);

        startAccountChangeTransition(async () => {
            try {
                const result = await authClient.multiSession.setActive({
                    sessionToken,
                });

                if (result.error) {
                    log.error("Failed to switch active session", result.error);
                    setSwitchAccountError(result.error);
                    return;
                }

                await Promise.all([refetch(), refreshDeviceSessions()]);
                router.refresh();
            } catch (error) {
                log.error("Failed to switch active session", error);
                setSwitchAccountError(error);
            } finally {
                setPendingSessionToken(null);
            }
        });
    });

    const handleAddAccount = useStableCallback(() => {
        setAddAccountError(null);

        startAddAccountTransition(async () => {
            try {
                const result = await authClient.signIn.social({
                    callbackURL: "/library",
                    errorCallbackURL: "/library",
                    provider: "google",
                });

                if (result.error) {
                    log.error("Failed to add account session", result.error);
                    setAddAccountError(result.error);
                }
            } catch (error) {
                log.error("Failed to add account session", error);
                setAddAccountError(error);
            }
        });
    });

    const accountMenuError = getAccountMenuError(
        addAccountError,
        deviceSessionsError
    );

    const accountOptions = activeSession
        ? getAccountOptions(deviceSessions, activeSession)
        : [];

    return {
        accountMenuError,
        accountOptions,
        activeSession,
        handleAccountChange,
        handleAddAccount,
        isAddingAccount,
        isLoadingDeviceSessions,
        pendingSessionToken,
        switchAccountError,
    };
}

function getAccountOptions(
    deviceSessions: DeviceSession[],
    activeSession: Session
): DeviceSession[] {
    const hasActiveSession = deviceSessions.some(
        (deviceSession) =>
            deviceSession.session.token === activeSession.session.token
    );

    if (hasActiveSession) {
        return deviceSessions;
    }

    return [
        {
            session: {
                token: activeSession.session.token,
            },
            user: activeSession.user,
        },
        ...deviceSessions,
    ];
}

function getAccountMenuError(
    addAccountError: unknown,
    deviceSessionsError: unknown
): AccountMenuError | null {
    if (addAccountError) {
        return "add";
    }
    if (deviceSessionsError) {
        return "load";
    }
    return null;
}
