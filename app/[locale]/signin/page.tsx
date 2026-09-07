import { getGT, getLocale } from "gt-next/server";
import type { Metadata } from "next";
import { buildPageMetadata } from "@/app/metadata";
import { SignInButton } from "@/components/auth/sign-in-button";
import { getServerSession } from "@/lib/auth/session";

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
        <div className="flex min-h-dvh max-w-md flex-col items-center justify-center">
            <SignInButton hasServerSession={!!session} />
        </div>
    );
}
