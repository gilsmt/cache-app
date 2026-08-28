import { getGT, getLocale } from "gt-next/server";
import type { Metadata } from "next";
import { buildPageMetadata } from "@/app/metadata";
import { PageShell } from "@/components/ui/page-shell";
import { LogoutPageClient } from "./client";

export async function generateMetadata(): Promise<Metadata> {
    const locale = await getLocale();
    const gt = await getGT();

    return {
        ...buildPageMetadata({
            description: gt("Signing you out…"),
            keywords: ["sign out", "logout", "Cache App"],
            locale,
            path: "/logout",
            title: gt("Sign out"),
        }),
        robots: {
            follow: false,
            index: false,
        },
    };
}

export default function LogoutPage() {
    return (
        <PageShell>
            <LogoutPageClient />
        </PageShell>
    );
}
