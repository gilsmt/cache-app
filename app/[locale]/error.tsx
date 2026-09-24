"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { T } from "gt-next";
import Link from "next/link";
import { useEffect } from "react";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { createLogger } from "@/lib/common/logs/console/logger";
import LogoIconImage from "@/public/cache-app-icon.png";

const log = createLogger("ErrorComponent");

interface NextError extends Error {
    digest?: string;
}

export default function ErrorPage({
    error,
    reset,
}: {
    error: NextError;
    reset: () => void;
}) {
    useEffect(() => {
        log.error(JSON.stringify(error));
    }, [error]);

    const handleReset = useStableCallback(() => reset());

    return (
        <PageShell>
            <div className="mx-auto flex h-svh max-w-md flex-col items-center justify-center gap-5 text-center">
                <BrandLogo className="scale-80" src={LogoIconImage} />
                <h1 className="font-medium text-foreground text-lg">
                    <T>Something went wrong</T>
                </h1>
                <p className="text-base text-muted-foreground">
                    <T>We encountered an unexpected error…</T>
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                    <Button onClick={handleReset}>
                        <T>Try again</T>
                    </Button>
                    <Link
                        className={buttonVariants({ variant: "secondary" })}
                        href="/"
                    >
                        <T>Home</T>
                    </Link>
                </div>
            </div>
        </PageShell>
    );
}
