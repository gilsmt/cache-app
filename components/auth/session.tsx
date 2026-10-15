"use client";

import { T, Var } from "gt-next";
import { Info } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
    authClient,
    HAS_GOOGLE_ONE_TAP_CLIENT_ID,
    useSession,
} from "@/lib/auth/client";
import type { Session } from "@/lib/auth/session";
import { createLogger } from "@/lib/common/logs/console/logger";
import { useDesktopApp } from "@/lib/desktop/use-desktop-platform";

const log = createLogger("auth:session");

/**
 * Mount once on public entry points. Repeated mounts may initialize Google's
 * script more than once.
 */
export function GoogleOneTapTrigger() {
    const { data: session, isPending } = useSession();
    const { isDesktopApp } = useDesktopApp();

    const sessionId = session?.session?.id;

    React.useEffect(() => {
        if (
            isPending ||
            sessionId ||
            isDesktopApp ||
            !HAS_GOOGLE_ONE_TAP_CLIENT_ID
        ) {
            return;
        }

        authClient.oneTap({ callbackURL: "/library" }).catch((error) => {
            log.error("Google One Tap init failed", error);
        });
    }, [isPending, sessionId, isDesktopApp]);

    return null;
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

interface SessionHintProps {
    serverSession?: Session | null;
}

/**
 * Pass `serverSession` to prevent layout shift before client hydration. The
 * client session still owns the sign-out button's loading state as it reflects
 * the live request.
 */
export function SessionHint({ serverSession }: SessionHintProps) {
    const { data: clientSession, isPending } = useSession();

    const session = serverSession ?? clientSession;

    if (!session) {
        return null;
    }

    return (
        <div className="flex items-center gap-2">
            <Info className="size-4 opacity-50" />
            <div className="font-medium text-xs leading-tight tracking-tighter opacity-50">
                {session.user.email ? (
                    <T>
                        You are signed in as <Var>{session.user.email}</Var>
                    </T>
                ) : null}
                <Button
                    isLoading={isPending}
                    nativeButton={false}
                    render={
                        <Link href="/signout" prefetch={false}>
                            <T context="User Sign out of the app">Log out</T>
                        </Link>
                    }
                    size="xs"
                    variant="link"
                />
            </div>
        </div>
    );
}
