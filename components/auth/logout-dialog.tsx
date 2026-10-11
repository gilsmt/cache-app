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

export function LogOutDialogTrigger(
    props: React.ComponentProps<typeof DialogTrigger>
) {
    const router = useRouter();

    const handleLogOut = useStableCallback(() => {
        router.push("/logout");
    });

    useHotkeys("alt+shift+q", handleLogOut, {
        description: "Log out",
    });

    return (
        <Dialog>
            <DialogTrigger {...props} />
            <DialogPopup>
                <DialogHeader>
                    <DialogTitle>
                        <T context="Logout dialog title">Log out?</T>
                    </DialogTitle>
                    <DialogDescription>
                        <T context="Logout dialog description">
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
                        onClick={handleLogOut}
                        render={<Button variant="destructive" />}
                    >
                        <T context="Logout confirm button">Log out</T>
                    </DialogClose>
                </DialogFooter>
            </DialogPopup>
        </Dialog>
    );
}
