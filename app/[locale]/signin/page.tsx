import { T } from "gt-next";
import { getGT, getLocale } from "gt-next/server";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { buildPageMetadata } from "@/app/metadata";
import { SignInButton } from "@/components/auth/sign-in-button";
import { PageShell } from "@/components/ui/page-shell";
import { getServerSession } from "@/lib/auth/session";
import {
    APP_NAME,
    CHANGELOG_URL,
    GITHUB_URL,
    SUPPORT_URL,
} from "@/lib/common/constants";
import AppIconSmall from "@/public/cache-icon-small.png";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
    const locale = await getLocale();
    const gt = await getGT();

    return {
        ...buildPageMetadata({
            description: gt("Sign in to access your bookmark library."),
            locale,
            path: "/signin",
            title: gt("Sign in"),
        }),
        robots: {
            follow: false,
            index: false,
        },
    };
}

export default async function SignInPage() {
    const session = await getServerSession();

    return (
        <PageShell>
            <div className="flex flex-1 items-center justify-center">
                <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5">
                    <Image
                        alt={APP_NAME}
                        className="h-auto w-10 select-none"
                        draggable="false"
                        preload
                        src={AppIconSmall}
                    />
                    <div className="flex w-full flex-col gap-2">
                        <h1 className="font-medium text-2xl text-foreground tracking-tight">
                            Cache App
                        </h1>
                        <p className="text-base text-muted-foreground">
                            <T>Sign up or log in to continue</T>
                        </p>
                    </div>
                    <SignInButton hasServerSession={!!session} />
                </div>
            </div>
            <div className="flex flex-wrap justify-center gap-4 pb-5 md:gap-6">
                <Link
                    className="text-muted-foreground text-sm transition-colors hover:text-foreground"
                    href={CHANGELOG_URL}
                    rel="noopener noreferrer"
                    target="_blank"
                >
                    <T>Changelog</T>
                </Link>
                <Link
                    className="text-muted-foreground text-sm transition-colors hover:text-foreground"
                    href={SUPPORT_URL}
                    rel="noopener noreferrer"
                    target="_blank"
                >
                    <T>Support</T>
                </Link>
                <Link
                    className="text-muted-foreground text-sm transition-colors hover:text-foreground"
                    href={GITHUB_URL}
                    rel="noopener noreferrer"
                    target="_blank"
                >
                    <T>GitHub</T>
                </Link>
            </div>
        </PageShell>
    );
}
