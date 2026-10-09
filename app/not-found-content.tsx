"use client";

import { T, Var } from "gt-next";
import Link from "next/link";
import { BrandLogo } from "@/components/ui/brand-logo";
import { buttonVariants } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { APP_NAME } from "@/lib/common/constants";
import LogoIconImage from "@/public/cache-app-icon.png";

export function NotFoundContent() {
    return (
        <PageShell>
            <div className="mx-auto flex h-svh max-w-md flex-col items-center justify-center gap-5 text-center">
                <BrandLogo className="scale-80" src={LogoIconImage} />
                <h1 className="font-medium text-foreground text-lg">
                    <T>Page not found</T>
                </h1>
                <p className="text-base text-muted-foreground">
                    <T>This page does not exist or has been moved.</T>
                </p>
                <Link
                    className={buttonVariants({ variant: "default" })}
                    href="/"
                >
                    <T>
                        Back to <Var>{APP_NAME}</Var>
                    </T>
                </Link>
            </div>
        </PageShell>
    );
}
