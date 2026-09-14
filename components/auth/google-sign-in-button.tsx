"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { cn } from "cn";
import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { GoogleIcon } from "@/components/ui/icons";
import { authClient } from "@/lib/auth/client";
import { getErrorMessage } from "@/lib/common/error";

const GOOGLE_SIGN_IN_ERROR_MESSAGE = "Could not start Google sign-in.";

export function GoogleSignInButton({
    callbackURL = "/library",
    className,
    children,
    size = "xl",
    ...props
}: ButtonProps & { callbackURL?: string }) {
    const [isPending, startTransition] = React.useTransition();
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

    const handleSignIn = useStableCallback(() => {
        setErrorMessage(null);
        startTransition(async () => {
            try {
                const result = await authClient.signIn.social({
                    callbackURL,
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
                {...props}
                className={cn(
                    "border border-[#747775] bg-white text-[#1f1f1f] shadow-xs hover:bg-[#f8f9fa] *:data-[slot=spinner]:text-[#1f1f1f] dark:border-input dark:bg-popover dark:text-foreground dark:hover:bg-accent/50 dark:*:data-[slot=spinner]:text-foreground",
                    className
                )}
                isLoading={isPending}
                onClick={handleSignIn}
                size={size}
            >
                <GoogleIcon />
                {children}
            </Button>
            <ErrorMessage className="text-sm underline decoration-dotted underline-offset-4">
                {errorMessage}
            </ErrorMessage>
        </div>
    );
}
