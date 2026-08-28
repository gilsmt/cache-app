import "@/lib/common/dayjs/locale";
import "../globals.css";

import { GTProvider, getLocales } from "gt-next";
import { getGT, getLocale } from "gt-next/server";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type * as React from "react";
import { ConsoleBanner } from "@/components/ui/console-banner";
import { ShortcutsProvider } from "@/components/ui/shortcuts";
import { ThemeHotkey } from "@/components/ui/theme";
import { ThemeSync } from "@/hooks/use-theme";
import { APP_NAME, BASE_URL } from "@/lib/common/constants";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/common/theme";
import { INTEGRATIONS } from "@/lib/integrations/support";
import packageJson from "@/package.json" with { type: "json" };

export function generateStaticParams() {
    return getLocales().map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
    const locale = await getLocale();
    const gt = await getGT();

    return {
        applicationName: APP_NAME,
        authors: [{ name: APP_NAME }],
        category: "technology",
        classification: "AI Development Tools",
        creator: APP_NAME,
        formatDetection: {
            address: false,
            email: false,
            telephone: false,
        },
        keywords: ["bookmarks", "bookmark manager"],
        metadataBase: new URL(BASE_URL),
        openGraph: {
            locale,
            siteName: APP_NAME,
            type: "website",
            url: BASE_URL,
        },
        other: {
            "llm:content-type": "web application",
            "llm:integrations": INTEGRATIONS.map((int) => int.label).join(", "),
            "llm:languages": "en",
            "llm:pricing": "free tier available, pro 8€/month",
            "llm:region": "global",
            "llm:use-cases":
                "unify bookmarks across platforms, AI-assisted collection organization, search across saved content, note-taking, automations",
        },
        publisher: APP_NAME,
        referrer: "strict-origin-when-cross-origin",
        robots: {
            follow: true,
            googleBot: {
                follow: true,
                index: true,
            },
            index: true,
        },
        title: {
            default: gt("Bookmark manager | {appName}", { appName: APP_NAME }),
            template: `%s | ${APP_NAME}`,
        },
        twitter: {
            card: "summary_large_image",
        },
    };
}

export const viewport: Viewport = {
    initialScale: 1,
    maximumScale: 1,
    viewportFit: "cover",
    width: "device-width",
};

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
});

export default async function LocaleLayout(props: React.PropsWithChildren) {
    const locale = await getLocale();

    return (
        <html
            className={`${inter.variable} scrollbar-gutter-stable h-full antialiased`}
            dir="ltr"
            lang={locale}
            suppressHydrationWarning
        >
            <head>
                <script
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: theme FOUC guard; runs before paint
                    dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
                />
                {/* Pinterest verification */}
                <meta
                    content="9c251d927955d913b23e047ef08ed572"
                    name="p:domain_verify"
                />
            </head>
            <body suppressHydrationWarning>
                <ThemeSync />
                <ConsoleBanner version={packageJson.version} />
                <div className="not-has-focus-visible:sr-only pointer-events-none fixed inset-x-0 top-0 z-50 mt-4 flex select-none justify-center">
                    <a
                        className="pointer-events-auto rounded-2xl bg-background px-4 py-2 text-base text-foreground outline-2 outline-offset-2 focus-visible:outline focus-visible:outline-ring print:hidden"
                        href="#main"
                    >
                        Skip to content
                    </a>
                </div>
                <GTProvider>
                    <ThemeHotkey />
                    <ShortcutsProvider>{props.children}</ShortcutsProvider>
                </GTProvider>
            </body>
        </html>
    );
}
