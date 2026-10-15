"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { T } from "gt-next";
import { useRouter } from "next/navigation";
import type * as React from "react";
import { useHotkeys } from "react-hotkeys-hook";
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

export function SignOutDialogTrigger(
    props: React.ComponentProps<typeof DialogTrigger>
) {
    const router = useRouter();

    const handleSignOut = useStableCallback(() => {
        router.push("/signout");
    });

    useHotkeys("alt+shift+q", handleSignOut, {
        description: "Sign out",
    });

    return (
        <Dialog>
            <DialogTrigger {...props} />
            <DialogPopup>
                <DialogHeader>
                    <DialogTitle>
                        <T context="Signout dialog title">Sign out?</T>
                    </DialogTitle>
                    <DialogDescription>
                        <T context="Signout dialog description">
                            You will need to sign in again to access your
                            library.
                        </T>
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <DialogClose render={<Button variant="ghost" />}>
                        <T context="Cancel button">Cancel</T>
                    </DialogClose>
                    <DialogClose
                        onClick={handleSignOut}
                        render={<Button variant="destructive" />}
                    >
                        <T context="Signout confirm button">Sign out</T>
                    </DialogClose>
                </DialogFooter>
            </DialogPopup>
        </Dialog>
    );
}
