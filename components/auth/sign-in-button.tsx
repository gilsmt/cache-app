"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { T } from "gt-next";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { GoogleIcon } from "@/components/ui/icons";
import { Kbd } from "@/components/ui/kbd";
import { authClient } from "@/lib/auth/client";
import { getErrorMessage } from "@/lib/common/error";

const GOOGLE_SIGN_IN_ERROR_MESSAGE = "Could not start Google sign-in.";

interface SignInButtonProps {
    hasServerSession: boolean;
}

export function SignInButton({ hasServerSession }: SignInButtonProps) {
    const router = useRouter();

    const handleShortcut = useStableCallback(() => {
        if (hasServerSession) {
            router.push("/library");
        }
    });

    useHotkeys("p", handleShortcut, {
        description: "Go to library",
    });

    if (hasServerSession) {
        return (
            <div className="flex w-full flex-col items-stretch gap-2">
                <Button
                    nativeButton={false}
                    render={
                        <Link href="/library">
                            Go to my library
                            <ChevronRight className="size-4" />
                        </Link>
                    }
                    size="xl"
                />
                <span className="text-muted-foreground mx-auto hidden text-center text-xs md:block">
                    Press <Kbd>P</Kbd>
                </span>
            </div>
        );
    }

    return <GoogleSignInButton />;
}

function GoogleSignInButton() {
    const [isPending, startTransition] = React.useTransition();
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

    const handleSignIn = useStableCallback(() => {
        setErrorMessage(null);
        startTransition(async () => {
            try {
                const result = await authClient.signIn.social({
                    callbackURL: "/library",
                    errorCallbackURL: "/",
                    provider: "google",
                });

                if (result.error) {
                    setErrorMessage(
                        result.error.message ?? GOOGLE_SIGN_IN_ERROR_MESSAGE
                    );
                }
            } catch (error) {
                setErrorMessage(
                    getErrorMessage(error, GOOGLE_SIGN_IN_ERROR_MESSAGE)
                );
            }
        });
    });

    return (
        <div className="flex flex-col gap-1">
            <Button
                className="dark:border-input dark:bg-popover dark:text-foreground dark:hover:bg-accent/50 dark:*:data-[slot=spinner]:text-foreground border border-[#747775] bg-white text-[#1f1f1f] hover:bg-[#f8f9fa] *:data-[slot=spinner]:text-[#1f1f1f]"
                isLoading={isPending}
                onClick={handleSignIn}
                size="xl"
            >
                <GoogleIcon />
                <T context="Sign in/up CTA button">Continue with Google</T>
            </Button>
            <ErrorMessage className="text-sm">{errorMessage}</ErrorMessage>
        </div>
    );
}
