"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { T } from "gt-next";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogPopup,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { ErrorMessage } from "@/components/ui/error-message";
import { deleteAccountAction } from "@/lib/account/actions";
import { authClient } from "@/lib/auth/client";
import { createLogger } from "@/lib/common/logs/console/logger";

const log = createLogger("auth-delete-account");

export function DeleteAccountDialogTrigger(
    props: React.ComponentProps<typeof DialogTrigger>
) {
    const router = useRouter();
    const [isOpen, setIsOpen] = React.useState(false);
    const [isPending, startTransition] = React.useTransition();
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
    const deleteSubmissionPendingRef = React.useRef(false);

    const handleConfirm = useStableCallback(() => {
        if (deleteSubmissionPendingRef.current) {
            return;
        }
        setErrorMessage(null);
        deleteSubmissionPendingRef.current = true;

        startTransition(async () => {
            try {
                const result = await deleteAccountAction();

                if (result.status === "error") {
                    setErrorMessage(result.message);
                    return;
                }

                try {
                    const signOutResult = await authClient.signOut();

                    if (signOutResult?.error) {
                        log.error("signOut after account deletion failed", {
                            code: signOutResult.error.code,
                            status: signOutResult.error.status,
                        });
                    }
                } catch (error) {
                    log.error(
                        "signOut after account deletion failed (network)",
                        error
                    );
                }

                router.push(result.redirect ?? "/logout");
            } catch (error) {
                log.error("deleteAccountAction failed", error);
                setErrorMessage(
                    "We couldn't delete your account. Please try again."
                );
            } finally {
                deleteSubmissionPendingRef.current = false;
            }
        });
    });

    const handleOpenChange = useStableCallback((nextOpen: boolean) => {
        if (nextOpen || !deleteSubmissionPendingRef.current) {
            setIsOpen(nextOpen);
            if (!nextOpen) {
                setErrorMessage(null);
            }
        }
    });

    return (
        <Dialog onOpenChange={handleOpenChange} open={isOpen}>
            <DialogTrigger {...props} />
            <DialogPopup aria-busy={isPending || undefined}>
                <DialogHeader>
                    <DialogTitle>
                        <T context="Delete account dialog title">
                            Delete your account?
                        </T>
                    </DialogTitle>
                    <DialogDescription>
                        <T context="Delete account dialog description">
                            This cancels any active subscription and permanently
                            deletes your library, collections, and account data.
                            This can't be undone.
                        </T>
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <DialogClose
                        disabled={isPending}
                        render={<Button variant="ghost" />}
                    >
                        <T context="Cancel button">Cancel</T>
                    </DialogClose>
                    <Button
                        isLoading={isPending}
                        onClick={handleConfirm}
                        variant="destructive"
                    >
                        <T context="Confirm delete account button">
                            Delete account
                        </T>
                    </Button>
                </DialogFooter>
                {errorMessage ? (
                    <ErrorMessage className="px-6 pb-6 underline decoration-dotted underline-offset-4">
                        {errorMessage}
                    </ErrorMessage>
                ) : null}
            </DialogPopup>
        </Dialog>
    );
}
