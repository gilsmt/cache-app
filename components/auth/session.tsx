"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { T, Var } from "gt-next";
import Link, { useLocalizeHref } from "gt-next/link";
import { Info } from "lucide-react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { GOOGLE_ONE_TAP_CLIENT_ID, useSession } from "@/lib/auth/client";
import { startGoogleOneTap } from "@/lib/auth/plugins/one-tap";
import type { Session } from "@/lib/auth/session";
import { createLogger } from "@/lib/common/logs/console/logger";
import { useDesktopApp } from "@/lib/desktop/use-desktop-platform";

const log = createLogger("auth:session");

export function SessionDesktopRedirect() {
    const router = useRouter();
    const localizeHref = useLocalizeHref();
    const { isDesktopApp } = useDesktopApp();
    const signInHref = localizeHref("/signin");

    React.useEffect(() => {
        if (!isDesktopApp) {
            return;
        }

        router.replace(signInHref);
    }, [isDesktopApp, router, signInHref]);

    return null;
}

/**
 * Mount once on public entry points because Google's prompt is global.
 */
export function GoogleOneTapTrigger() {
    const { data: session, isPending } = useSession();
    const { isDesktopApp } = useDesktopApp();
    const [isScriptReady, setIsScriptReady] = React.useState(false);

    const sessionId = session?.session?.id;

    const handleScriptReady = useStableCallback(() => setIsScriptReady(true));
    const handleScriptError = useStableCallback((error: Error) => {
        log.error("Google One Tap script failed", error);
    });

    React.useEffect(() => {
        if (
            isPending ||
            sessionId ||
            isDesktopApp ||
            !GOOGLE_ONE_TAP_CLIENT_ID ||
            !isScriptReady
        ) {
            return;
        }

        try {
            return startGoogleOneTap(
                "google" in window ? window.google : undefined,
                GOOGLE_ONE_TAP_CLIENT_ID
            );
        } catch (error) {
            log.error("Google One Tap init failed", error);
        }
    }, [isPending, sessionId, isDesktopApp, isScriptReady]);

    if (isPending || sessionId || isDesktopApp || !GOOGLE_ONE_TAP_CLIENT_ID) {
        return null;
    }

    return (
        <Script
            onError={handleScriptError}
            onLoad={handleScriptReady}
            onReady={handleScriptReady}
            src="https://accounts.google.com/gsi/client"
        />
    );
}

interface SessionGateProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

/**
 * This is a presentation gate, not an authorization boundary. Validate sessions
 * on the server before returning private data.
 */
export function SignedInOnly({ children, fallback = null }: SessionGateProps) {
    const { data: session, isPending } = useSession();

    if (isPending) {
        return fallback;
    }

    return session ? children : null;
}

/**
 * Pass `fallback` to avoid showing signed-out UI to a signed-in user for a
 * frame while the session resolves.
 */
export function SignedOutOnly({ children, fallback = null }: SessionGateProps) {
    const { data: session, isPending } = useSession();

    if (isPending) {
        return fallback;
    }

    return session ? null : children;
}

/**
 * Use for small inline affordances. Prefer route-level loading for full-page
 * suspense to avoid shell churn.
 */
export function SessionLoadingOnly({ children }: React.PropsWithChildren) {
    const { isPending } = useSession();

    return isPending ? children : null;
}

interface WithSessionOnlyProps {
    children: (user: Session["user"]) => React.ReactNode;
    fallback?: React.ReactNode;
}

/**
 * Receives only `session.user` to decouple call sites from better-auth's full
 * payload. Use a server-side session read for personalized initial renders.
 */
export function WithSessionOnly({
    children,
    fallback = null,
}: WithSessionOnlyProps) {
    const { isPending, data: session } = useSession();

    if (isPending) {
        return fallback;
    }

    if (!session?.user) {
        return null;
    }

    return children(session.user);
}

interface SessionStatusProps {
    serverSession?: Session | null;
}

/**
 * Pass `serverSession` to prevent layout shift while the client session loads.
 * Use the client session after it resolves so account changes stay visible.
 */
export function SessionStatus({ serverSession }: SessionStatusProps) {
    const { data: clientSession, isPending } = useSession();

    const session = isPending
        ? (serverSession ?? clientSession)
        : clientSession;

    if (!session) {
        return null;
    }

    return (
        <div className="flex items-center gap-2">
            <Info className="size-4 opacity-50" />
            <div className="text-xs leading-tight font-medium tracking-tighter opacity-50">
                {session.user.email ? (
                    <T>
                        You are signed in as <Var>{session.user.email}</Var>
                    </T>
                ) : null}
                <Button
                    isLoading={isPending}
                    nativeButton={false}
                    render={<Link href="/signout" prefetch={false} />}
                    size="xs"
                    variant="link"
                >
                    <T context="User Sign out of the app">Log out</T>
                </Button>
            </div>
        </div>
    );
}
