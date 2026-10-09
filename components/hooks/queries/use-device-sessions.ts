import useSWR from "swr";
import { authClient } from "@/lib/auth/client";
import type { Session } from "@/lib/auth/session";

const DEVICE_SESSIONS_SWR_KEY = ["device-sessions"] as const;

export interface DeviceSession {
    session: {
        token: string;
    };
    user: NonNullable<Session>["user"];
}

async function fetchDeviceSessions(): Promise<DeviceSession[]> {
    const result = await authClient.multiSession.listDeviceSessions();
    if (result.error) {
        throw new Error("Failed to load device sessions.");
    }
    return result.data ?? [];
}

export function useDeviceSessions(isEnabled: boolean) {
    const {
        data = [],
        error,
        isLoading,
        mutate,
    } = useSWR<DeviceSession[], Error>(
        isEnabled ? DEVICE_SESSIONS_SWR_KEY : null,
        fetchDeviceSessions
    );

    return {
        deviceSessions: data,
        deviceSessionsError: error,
        isLoadingDeviceSessions: isLoading,
        refreshDeviceSessions: mutate,
    };
}
