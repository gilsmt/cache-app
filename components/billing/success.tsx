"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { T } from "gt-next";
import { MetalText } from "metal-fx";
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
    const { mutate: refreshAccess } = useSubscriptionAccess();
    const [upgraded, setUpgraded] = useQueryState(
        UPGRADED_SEARCH_PARAM,
        parseAsString.withOptions({ history: "replace", scroll: false })
    );

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
            <DialogPopup>
                <DialogHeader className="items-center gap-3 text-center">
                    <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <CrownFilledIcon className="size-6" />
                    </span>
                    <DialogTitle className="font-normal text-3xl">
                        <T context="Upgrade success dialog title prefix">
                            Welcome to
                        </T>
                        &nbsp;
                        <MetalText
                            color="var(--foreground)"
                            font="400 30px/1.2 var(--font-sans)"
                            glow
                            shaderScale={1.7}
                            strength={0.95}
                        >
                            Pro
                        </MetalText>
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
