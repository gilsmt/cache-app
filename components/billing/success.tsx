"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { T } from "gt-next";
import { parseAsString, useQueryState } from "nuqs";
import * as React from "react";
import {
    UPGRADED_SEARCH_PARAM,
    UPGRADED_SEARCH_VALUE,
    useSubscriptionAccess,
} from "@/components/billing/subscription";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogPopup,
    DialogTitle,
} from "@/components/ui/dialog";
import { CrownFilledIcon } from "@/components/ui/icons";

export function SuccessfulUpgradeDialog() {
    const [upgraded, setUpgraded] = useQueryState(
        UPGRADED_SEARCH_PARAM,
        parseAsString.withOptions({ history: "replace", scroll: false })
    );
    const { mutate: refreshAccess } = useSubscriptionAccess();

    const isOpen = upgraded === UPGRADED_SEARCH_VALUE;

    React.useEffect(() => {
        if (isOpen) {
            refreshAccess();
        }
    }, [isOpen, refreshAccess]);

    const handleOpenChange = useStableCallback((open: boolean) => {
        if (!open) {
            setUpgraded(null);
        }
    });

    return (
        <Dialog onOpenChange={handleOpenChange} open={isOpen}>
            <DialogPopup className="max-w-sm">
                <DialogHeader className="items-center text-center">
                    <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <CrownFilledIcon className="size-6" />
                    </span>
                    <DialogTitle>
                        <T context="Upgrade success dialog title">
                            Welcome to Pro
                        </T>
                    </DialogTitle>
                    <DialogDescription>
                        <T context="Upgrade success dialog description">
                            Your library is now fully unlocked, along with every
                            integration.
                        </T>
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="sm:justify-center">
                    <DialogClose render={<Button />}>
                        <T context="Upgrade success dialog button">
                            Start exploring
                        </T>
                    </DialogClose>
                </DialogFooter>
            </DialogPopup>
        </Dialog>
    );
}
