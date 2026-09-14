import "@/lib/common/dayjs/locale";
import "../globals.css";

import { GTProvider, getLocales } from "gt-next";
import { getGT, getLocale } from "gt-next/server";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type * as React from "react";
import {
    buildLocaleAlternates,
    DEFAULT_OG_IMAGE,
    DEFAULT_OG_IMAGE_ALT,
    toOpenGraphLocale,
} from "@/app/metadata";
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
    const description = gt(
        "The AI bookmark manager for busy people. View, manage, and organize bookmarks across platforms."
    );
    const title = gt("Bookmark manager | {appName}", { appName: APP_NAME });

    return {
        alternates: buildLocaleAlternates("/", locale),
        applicationName: APP_NAME,
        authors: [{ name: APP_NAME }],
        category: "productivity",
        creator: APP_NAME,
        description,
        formatDetection: {
            address: false,
            email: false,
            telephone: false,
        },
        keywords: [
            "bookmark manager",
            "bookmarks",
            "unify bookmarks",
            "save content",
            "personal knowledge library",
            "AI bookmark organizer",
        ],
        metadataBase: new URL(BASE_URL),
        openGraph: {
            description,
            images: [
                {
                    alt: DEFAULT_OG_IMAGE_ALT,
                    height: 630,
                    url: DEFAULT_OG_IMAGE,
                    width: 1200,
                },
            ],
            locale: toOpenGraphLocale(locale),
            siteName: APP_NAME,
            title,
            type: "website",
            url: `${BASE_URL}/${locale}`,
        },
        other: {
            "llm:content-type": "web application",
            "llm:integrations": INTEGRATIONS.map((int) => int.label).join(", "),
            "llm:languages": getLocales().join(", "),
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
            default: title,
            template: `%s | ${APP_NAME}`,
        },
        twitter: {
            card: "summary_large_image",
            description,
            images: [
                {
                    alt: DEFAULT_OG_IMAGE_ALT,
                    height: 630,
                    url: DEFAULT_OG_IMAGE,
                    width: 1200,
                },
            ],
            title,
        },
    };
}

export const viewport: Viewport = {
    colorScheme: "light dark",
    initialScale: 1,
    themeColor: [
        { color: "#ffffff", media: "(prefers-color-scheme: light)" },
        { color: "#000000", media: "(prefers-color-scheme: dark)" },
    ],
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
                    <NuqsAdapter>
                        <ThemeHotkey />
                        <ShortcutsProvider>{props.children}</ShortcutsProvider>
                    </NuqsAdapter>
                </GTProvider>
            </body>
        </html>
    );
}
