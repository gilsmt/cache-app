"use client";

import { T } from "gt-next";
import type * as React from "react";
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

export function AccountExportDialogTrigger(
    props: React.ComponentProps<typeof DialogTrigger>
) {
    return (
        <Dialog>
            <DialogTrigger {...props} />
            <DialogPopup>
                <DialogHeader>
                    <DialogTitle>
                        <T>Export account data</T>
                    </DialogTitle>
                    <DialogDescription>
                        <T>Account data export is coming soon.</T>
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <DialogClose render={<Button variant="ghost" />}>
                        <T>Close</T>
                    </DialogClose>
                </DialogFooter>
            </DialogPopup>
        </Dialog>
    );
}
