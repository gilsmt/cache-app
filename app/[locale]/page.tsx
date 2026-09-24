import { cn } from "cn";
import { LocaleSelector, T } from "gt-next";
import { getGT } from "gt-next/server";
import {
    Album,
    Bookmark,
    CircleCheck,
    CloudDownload,
    Component,
    Lightbulb,
    Search,
    SquareMousePointer,
    Terminal,
    Unlink,
    Workflow,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import type * as React from "react";
import { buildPageMetadata } from "@/app/metadata";
import { DesktopHomeRedirect } from "@/components/auth/desktop-home-redirect";
import { GoogleOneTapTrigger, SessionHint } from "@/components/auth/session";
import { SignInButton } from "@/components/auth/sign-in-button";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Button } from "@/components/ui/button";
import {
    Carousel,
    CarouselControls,
    CarouselPanel,
} from "@/components/ui/carousel";
import { Footer } from "@/components/ui/footer";
import { GradientWaveText } from "@/components/ui/gradient-wave-text";
import {
    ChromeIcon,
    ClaudeIcon,
    GeminiIcon,
    GithubIcon,
    GrokIcon,
    ModelContextProtocolIcon,
    OpenAIIcon,
    PerplexityIcon,
    TikTokIcon,
} from "@/components/ui/icons";
import { JsonLdScript } from "@/components/ui/json-ld-script";
import { PageShell } from "@/components/ui/page-shell";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
} from "@/components/ui/sidebar";
import { getServerSession } from "@/lib/auth/session";
import {
    APP_NAME,
    BASE_URL,
    CACHE_EXTENSION_DOWNLOAD_URL,
    FOUNDING_DATE,
    GITHUB_URL,
} from "@/lib/common/constants";
import { INTEGRATIONS } from "@/lib/integrations/support";
import AiSectionLifestyleImage from "@/public/ai-section-lifestyle.webp";
import AiSectionTravelImage from "@/public/ai-section-travel.webp";
import LogoIconImage from "@/public/cache-app-icon.png";
import IconSmallImage from "@/public/cache-icon-small.png";
import CollectionsSectionImage from "@/public/collections-section-image.webp";
import HeroImage from "@/public/hero-image.webp";
import LibrarySectionImage from "@/public/library-section.webp";
import OrganizeSectionImage from "@/public/organize-section.webp";
import SmartCollectionsBackgroundImage from "@/public/smart-collections-background.webp";

export const instant = false;

const HOME_JSON_LD: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@graph": [
        {
            "@type": "WebSite",
            inLanguage: ["en-US", "es-ES"],
            name: APP_NAME,
            publisher: {
                "@id": `${BASE_URL}/#organization`,
            },
            url: BASE_URL,
        },
        {
            "@id": `${BASE_URL}/#organization`,
            "@type": "Organization",
            contactPoint: {
                "@type": "ContactPoint",
                contactType: "customer service",
                email: "notices@cachd.app",
            },
            description:
                "Cache is the AI bookmark manager for busy people. Collect, organize, and rediscover everything you've saved across platforms.",
            foundingDate: FOUNDING_DATE.toISOString().slice(0, 10),
            logo: {
                "@type": "ImageObject",
                height: 96,
                url: `${BASE_URL}/icon1.png`,
                width: 96,
            },
            name: "CachdApp, Inc.",
            sameAs: [GITHUB_URL],
            url: BASE_URL,
        },
        {
            "@type": "SoftwareApplication",
            applicationCategory: "ProductivityApplication",
            description:
                "Cache is the AI bookmark manager for busy people. Collect, organize, and rediscover everything you've saved across platforms.",
            name: APP_NAME,
            offers: {
                "@type": "Offer",
                availability: "https://schema.org/InStock",
                price: "8",
                priceCurrency: "USD",
                url: BASE_URL,
            },
            operatingSystem: "Any",
            publisher: {
                "@id": `${BASE_URL}/#organization`,
            },
            url: BASE_URL,
        },
    ],
};

const HERO_IMAGE_SIZES = "(max-width: 1024px) 100vw, 1024px";
const SECTION_IMAGE_SIZES = "(max-width: 768px) 100vw, 512px";
const ASK_CACHE_QUERY =
    "What does Cache, the app at https://www.cachd.app, do?";
const ASK_CACHE_CHATGPT_URL = `https://chatgpt.com/?${new URLSearchParams({
    q: ASK_CACHE_QUERY,
})}`;
const ASK_CACHE_CLAUDE_URL = `https://claude.ai/new?${new URLSearchParams({
    q: ASK_CACHE_QUERY,
})}`;
const ASK_CACHE_PERPLEXITY_URL = `https://www.perplexity.ai/search?${new URLSearchParams(
    {
        q: ASK_CACHE_QUERY,
    }
)}`;
const ASK_CACHE_GEMINI_URL = `https://gemini.google.com/app?${new URLSearchParams(
    {
        q: ASK_CACHE_QUERY,
    }
)}`;
const ASK_CACHE_GROK_URL = `https://grok.com/?${new URLSearchParams({
    q: ASK_CACHE_QUERY,
})}`;

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await params;
    const gt = await getGT();

    const metadata = buildPageMetadata({
        description: gt(
            "The AI bookmark manager for busy people. View, manage, and organize bookmarks across platforms."
        ),
        keywords: [
            "bookmark manager",
            "unify bookmarks",
            "save content",
            "notion",
            "personal knowledge library",
            "Cache App",
        ],
        locale,
        path: "/",
        title: {
            absolute: `Cache | ${gt("Unify your bookmarks across every platform")}`,
        },
    });

    return {
        ...metadata,
        alternates: {
            ...metadata.alternates,
            types: {
                "text/markdown": `${BASE_URL}/api/markdown/home/${locale}`,
            },
        },
    };
}

export default async function Home() {
    const session = await getServerSession();
    const gt = await getGT();

    return (
        <PageShell>
            <DesktopHomeRedirect />
            <JsonLdScript data={HOME_JSON_LD} />
            <GoogleOneTapTrigger />
            <article className="flex flex-1 flex-col gap-8 lg:flex-row lg:justify-between">
                <Sidebar>
                    <SidebarContent>
                        <BrandLogo href="/library" src={LogoIconImage} />
                        <T context="'Cache' is the product's name">
                            <h1 className="font-medium text-[3rem] leading-[98%] tracking-[-0.2rem] md:text-[4rem]">
                                <GradientWaveText
                                    ariaLabel={gt("Bookmark Intelligence")}
                                    className="pb-1.5"
                                >
                                    Bookmark Intelligence
                                </GradientWaveText>
                            </h1>
                            <p className="font-medium text-base text-foreground leading-[1.22] tracking-[-3%] opacity-50 lg:max-w-[320px]">
                                Cache is the AI bookmark manager for busy
                                people. Collect, organize, and rediscover
                                everything you've saved across platforms.
                            </p>
                        </T>
                        <SignInButton hasServerSession={!!session} />
                        <SessionHint serverSession={session} />
                    </SidebarContent>
                    <SidebarFooter>
                        <div className="hidden items-center gap-3 lg:flex">
                            <a
                                className="flex flex-col gap-1 pb-0.5 hover:opacity-60"
                                href={CACHE_EXTENSION_DOWNLOAD_URL}
                                rel="noopener noreferrer"
                                target="_blank"
                            >
                                <p className="font-medium text-foreground text-lg tracking-[-3%]">
                                    <T context="Chrome web store browser extension">
                                        Install the extension
                                    </T>
                                </p>
                                <p className="flex shrink-0 flex-row items-center gap-2 truncate text-base text-foreground leading-[1.22] tracking-[-3%]">
                                    <span>
                                        <ChromeIcon className="size-4" />
                                    </span>
                                    <span className="opacity-50">
                                        Chrome Web Store
                                    </span>
                                </p>
                            </a>
                        </div>
                        <div className="hidden lg:block">
                            <LocaleSelector
                                id="language-selector"
                                name="language"
                            />
                        </div>
                    </SidebarFooter>
                </Sidebar>
                <div className="flex w-full max-w-5xl flex-col gap-12 p-8 pb-0 lg:gap-16 2xl:mx-auto">
                    <div className="relative aspect-video w-full min-w-0 overflow-hidden rounded-2xl bg-muted">
                        <div aria-live="polite" className="sr-only">
                            <T>
                                This element contains an interactive demo for
                                sighted users showing the Cache App interface.
                                The interface is displayed over a subtle, solid
                                brand background.
                            </T>
                        </div>
                        <Image
                            alt=""
                            aria-hidden
                            className="absolute top-9.5 left-9 w-full rounded-xl"
                            placeholder="blur"
                            preload
                            quality={90}
                            sizes={HERO_IMAGE_SIZES}
                            src={HeroImage}
                        />
                        <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-black/3 ring-inset dark:ring-white/3"
                        />
                    </div>
                    <div className="mx-auto -mt-2 mb-3 flex flex-col gap-2 md:max-w-prose md:pl-24">
                        <h2 className="font-normal text-lg leading-snug">
                            <T>
                                Save hours every week with a smarter way to
                                handle everything you save online — from
                                $8/month.
                            </T>
                        </h2>
                        <Button
                            className="w-fit px-0 text-muted-foreground"
                            nativeButton={false}
                            render={
                                <a
                                    aria-label={gt("GitHub Repository")}
                                    href="/github"
                                    rel="noopener noreferrer"
                                    target="_blank"
                                />
                            }
                            size="sm"
                            variant="link"
                        >
                            <GithubIcon
                                aria-hidden
                                className="size-4"
                                focusable="false"
                            />
                            &nbsp;<T>Open-source. Truly yours</T>
                        </Button>
                    </div>
                    <section className="grid w-full grid-cols-1 gap-2 md:grid-cols-2 md:gap-10">
                        <div className="flex max-w-[340px] flex-col gap-3 py-5 md:gap-4">
                            <T context="Library">
                                <h2 className="font-medium text-[28px] text-foreground leading-[1.1] tracking-[-1.28px] lg:text-[32px]">
                                    Curate a library of all the content you love
                                </h2>
                                <p className="text-pretty font-medium text-base text-foreground leading-[1.2] tracking-[-3%] opacity-50">
                                    Get inspired, find that lesson, recipe, or
                                    idea you've been looking for, all in the
                                    span of a coffee break.
                                </p>
                            </T>
                            <ul className="mt-2 flex flex-col space-y-2 text-xs">
                                <T context="Features">
                                    <li className="flex items-center gap-2">
                                        <Search className="inline-block size-4 shrink-0" />
                                        <span>
                                            Search by asking and Cache will find
                                            what you need
                                        </span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <Lightbulb className="inline-block size-4 shrink-0" />
                                        <span>
                                            Discuss your bookmarks in context
                                            with AI
                                        </span>
                                    </li>
                                </T>
                            </ul>
                        </div>
                        <div className="order-first aspect-square w-full overflow-hidden rounded-2xl bg-muted md:order-last">
                            <figure className="overflow-hidden">
                                <Image
                                    alt=""
                                    height={800}
                                    placeholder="blur"
                                    quality={90}
                                    sizes={SECTION_IMAGE_SIZES}
                                    src={LibrarySectionImage}
                                    width={800}
                                />
                            </figure>
                        </div>
                    </section>
                    <section className="grid w-full grid-cols-1 gap-2 md:grid-cols-2 md:gap-10">
                        <div className="flex max-w-[340px] flex-col gap-3 py-5 md:gap-4">
                            <T context="Integrations">
                                <h2 className="font-medium text-[28px] text-foreground leading-[1.1] tracking-[-1.28px] lg:text-[32px]">
                                    Bring in everything you've already saved
                                </h2>
                                <p className="text-pretty font-medium text-base text-foreground leading-[1.2] tracking-[-3%] opacity-50">
                                    Bring together bookmarks from your browser,
                                    socials, and videos automatically. Ditch the
                                    endless scrolling and tabbing through
                                    multiple platforms to find what matters most
                                    to you.
                                </p>
                            </T>
                            <ul className="mt-2 flex flex-col space-y-2 text-xs">
                                <T context="Features">
                                    <li className="flex items-center gap-2">
                                        <SquareMousePointer className="inline-block size-4 shrink-0" />
                                        <span>
                                            Save from anywhere with the browser
                                            extension
                                        </span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <CloudDownload className="inline-block size-4 shrink-0" />
                                        <span>
                                            Share or export your collections
                                            from Cache anytime
                                        </span>
                                    </li>
                                </T>
                            </ul>
                        </div>
                        <div className="order-first aspect-square w-full overflow-hidden rounded-2xl bg-muted md:order-last">
                            <figure className="relative flex h-full items-center justify-center overflow-hidden p-6">
                                <div className="relative mx-auto flex w-full max-w-sm items-center justify-between">
                                    <div className="space-y-6">
                                        {INTEGRATIONS.slice(0, 3).map(
                                            ({ id, Icon }, index) => (
                                                <IntegrationCard
                                                    key={id}
                                                    position={
                                                        [
                                                            "left-top",
                                                            "left-middle",
                                                            "left-bottom",
                                                        ][
                                                            index
                                                        ] as IntegrationCardPosition
                                                    }
                                                >
                                                    <Icon className="size-6" />
                                                </IntegrationCard>
                                            )
                                        )}
                                    </div>
                                    <div className="relative z-20 rounded-2xl border bg-muted p-1">
                                        <IntegrationCard
                                            className="size-16 border-black/20 shadow-black/10 shadow-xl"
                                            isCenter
                                        >
                                            <Image
                                                alt="Cache"
                                                className="size-9"
                                                height={32}
                                                src={IconSmallImage}
                                                width={32}
                                            />
                                        </IntegrationCard>
                                    </div>
                                    <div
                                        aria-hidden
                                        className="mask-[radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)] absolute inset-1/3 bg-[radial-gradient(var(--dots-color)_1px,transparent_1px)] bg-size-[16px_16px] opacity-50 [--dots-color:var(--foreground)]"
                                    />
                                    <div className="space-y-6">
                                        {INTEGRATIONS.slice(3, 6).map(
                                            ({ id, Icon }, index) => (
                                                <IntegrationCard
                                                    key={id}
                                                    position={
                                                        [
                                                            "right-top",
                                                            "right-middle",
                                                            "right-bottom",
                                                        ][
                                                            index
                                                        ] as IntegrationCardPosition
                                                    }
                                                >
                                                    <Icon className="size-6" />
                                                </IntegrationCard>
                                            )
                                        )}
                                    </div>
                                </div>
                            </figure>
                        </div>
                    </section>
                    <section className="grid w-full grid-cols-1 gap-2 md:grid-cols-2 md:gap-10">
                        <div className="flex max-w-[340px] flex-col gap-3 py-5 md:gap-4">
                            <T context="Habits">
                                <h2 className="font-medium text-[28px] text-foreground leading-[1.1] tracking-[-1.28px] lg:text-[32px]">
                                    Stop leaving it for later
                                </h2>
                                <p className="text-pretty font-medium text-base text-foreground leading-[1.2] tracking-[-3%] opacity-50">
                                    We all save things with good intentions,
                                    only to let them fade into a forgotten list.
                                    Cache brings your best saved content back to
                                    you when it's most useful.
                                </p>
                            </T>
                            <ul className="mt-2 flex flex-col space-y-2 text-xs">
                                <T context="Features">
                                    <li className="flex items-center gap-2">
                                        <Workflow className="inline-block size-4 shrink-0" />
                                        <span>
                                            Set up simple routines that show you
                                            a daily digest of your recent saves,
                                            and more
                                        </span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <Bookmark className="inline-block size-4 shrink-0" />
                                        <span>
                                            Keep important links top of mind
                                            instead of buried in a backlog
                                        </span>
                                    </li>
                                </T>
                            </ul>
                        </div>
                        <div className="order-first aspect-square w-full overflow-hidden rounded-2xl bg-muted md:order-last">
                            <figure className="overflow-hidden">
                                <Image
                                    alt=""
                                    height={800}
                                    placeholder="blur"
                                    sizes={SECTION_IMAGE_SIZES}
                                    src={CollectionsSectionImage}
                                    width={800}
                                />
                            </figure>
                        </div>
                    </section>
                    <section className="grid w-full grid-cols-1 gap-2 md:grid-cols-2 md:gap-10">
                        <div className="flex max-w-[340px] flex-col gap-3 py-5 md:gap-4">
                            <T context="Feed">
                                <h2 className="font-medium text-[28px] text-foreground leading-[1.1] tracking-[-1.28px] lg:text-[32px]">
                                    Search and explore from a single, fast feed
                                </h2>
                                <p className="text-pretty font-medium text-base text-foreground leading-[1.2] tracking-[-3%] opacity-50">
                                    Streamline the way you revisit your saved
                                    content through a modern and powerful
                                    interface.
                                </p>
                            </T>
                            <ul className="mt-2 flex flex-col space-y-2 text-xs">
                                <T context="Features">
                                    <li className="flex items-center gap-2">
                                        <Terminal className="inline-block size-4 shrink-0" />
                                        <span>
                                            Use command menu and shortcuts for
                                            efficient workflows
                                        </span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <Album className="inline-block size-4 shrink-0" />
                                        <span>
                                            Read articles without distractions
                                            using Quick Look
                                        </span>
                                    </li>
                                </T>
                            </ul>
                        </div>
                        <div className="order-first aspect-square w-full overflow-hidden rounded-2xl bg-muted md:order-last">
                            <figure className="overflow-hidden">
                                <Image
                                    alt=""
                                    height={800}
                                    placeholder="blur"
                                    sizes={SECTION_IMAGE_SIZES}
                                    src={OrganizeSectionImage}
                                    width={800}
                                />
                            </figure>
                        </div>
                    </section>
                    <section className="grid w-full grid-cols-1 gap-2 md:grid-cols-2 md:gap-10">
                        <div className="flex max-w-[340px] flex-col gap-3 py-5 md:gap-4">
                            <T>
                                <h2 className="font-medium text-[28px] text-foreground leading-[1.1] tracking-[-1.28px] lg:text-[32px]">
                                    Spot the stale, keep the useful
                                </h2>
                                <p className="text-pretty font-medium text-base text-foreground leading-[1.2] tracking-[-3%] opacity-50">
                                    Build a knowledge base from the saved
                                    content you've already marked as important
                                    to you. Import once and Cache organizes them
                                    in minutes.
                                </p>
                            </T>
                            <ul className="mt-2 flex flex-col space-y-2 text-xs">
                                <T context="Features">
                                    <li className="flex items-center gap-2">
                                        <Component className="inline-block size-4 shrink-0" />
                                        <span>
                                            <span className="font-medium">
                                                Smart Collections
                                            </span>{" "}
                                            helps you separate the actionable
                                            from the inspiration
                                        </span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <Unlink className="inline-block size-4 shrink-0" />
                                        <span>
                                            Filter duplicates and broken links
                                        </span>
                                    </li>
                                </T>
                            </ul>
                        </div>
                        <div className="relative order-first aspect-square w-full overflow-hidden rounded-2xl bg-muted md:order-last">
                            <figure className="relative h-full overflow-hidden">
                                <Image
                                    alt=""
                                    className="object-cover"
                                    fill
                                    placeholder="blur"
                                    sizes={SECTION_IMAGE_SIZES}
                                    src={SmartCollectionsBackgroundImage}
                                />
                                <div className="relative flex h-full items-center justify-center p-8 py-12">
                                    <div
                                        aria-hidden
                                        className="w-full max-w-96"
                                    >
                                        <div className="flex items-center gap-2 rounded-xl border bg-background p-3 shadow-sm">
                                            <CircleCheck className="size-4.5 fill-emerald-500/15 text-emerald-500" />
                                            <span className="font-medium text-foreground text-sm">
                                                <T context="Status in the Cache interface demo. Use the same Spanish terms as the product UI.">
                                                    All done — Content library
                                                    organized
                                                </T>
                                            </span>
                                        </div>
                                        <div className="relative space-y-4 pt-6 pl-6">
                                            <div className="absolute top-0 bottom-8 left-6 border-border border-l border-dashed mix-blend-color-dodge" />
                                            <div className="relative pl-6">
                                                <div className="absolute top-0 bottom-1/2 left-0 w-6 rounded-bl-full border-border border-b border-l border-dashed mix-blend-color-dodge" />
                                                <div className="flex items-center gap-2 rounded-xl border bg-background p-3 shadow-sm">
                                                    <ChromeIcon className="size-3.5" />
                                                    <span className="font-medium text-[11px] text-muted-foreground">
                                                        <T context="Status in the Cache interface demo. Translate bookmarks consistently as marcadores.">
                                                            Bookmarks imported
                                                        </T>
                                                        <span className="pl-3 text-foreground/50">
                                                            <T context="Relative time in the Cache interface demo.">
                                                                1m ago
                                                            </T>
                                                        </span>
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="relative pl-6">
                                                <div className="absolute top-0 bottom-1/2 left-0 w-6 rounded-bl-full border-border border-b border-l border-dashed mix-blend-color-dodge" />
                                                <div className="flex items-center gap-2 rounded-xl border bg-background p-3 shadow-sm">
                                                    <TikTokIcon className="size-3.5" />
                                                    <span className="font-medium text-[11px] text-muted-foreground">
                                                        <T context="Status in the Cache interface demo. Translate bookmarks consistently as marcadores.">
                                                            Bookmarks imported
                                                        </T>
                                                        <span className="pl-3 text-foreground/50">
                                                            <T context="Relative time in the Cache interface demo.">
                                                                1m ago
                                                            </T>
                                                        </span>
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="relative pl-6">
                                                <div className="absolute top-0 bottom-1/2 left-0 w-6 rounded-bl-full border-border border-b border-l border-dashed mix-blend-color-dodge" />
                                                <div className="flex items-center gap-2 rounded-xl border bg-background p-3 shadow-sm">
                                                    <Component className="size-3.5" />
                                                    <span className="font-medium text-[11px] text-muted-foreground">
                                                        <T context="Status in the Cache interface demo. Use the same Spanish terms as the product UI.">
                                                            Smart Collections
                                                            sorted 40 entries
                                                        </T>
                                                        <span className="pl-3 text-foreground/50">
                                                            <T context="Relative time in the Cache interface demo.">
                                                                24s ago
                                                            </T>
                                                        </span>
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="relative pl-6">
                                                <div className="absolute top-0 bottom-1/2 left-0 w-6 rounded-bl-full border-border border-b border-l border-dashed mix-blend-color-dodge" />
                                                <div className="flex items-center gap-2 rounded-xl border bg-background p-3 shadow-sm">
                                                    <Search className="size-3.5" />
                                                    <span className="font-medium text-[11px] text-muted-foreground">
                                                        <T context="Status in the Cache interface demo.">
                                                            OCR search indexed
                                                        </T>
                                                        <span className="pl-3 text-foreground/50">
                                                            <T context="Relative time in the Cache interface demo.">
                                                                8s ago
                                                            </T>
                                                        </span>
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="relative pl-6">
                                                <div className="absolute top-0 bottom-1/2 left-0 w-6 rounded-bl-full border-border border-b border-l border-dashed mix-blend-color-dodge" />
                                                <div className="flex items-center gap-2 rounded-xl border bg-background p-3 shadow-sm">
                                                    <CloudDownload className="size-3.5" />
                                                    <span className="font-medium text-[11px] text-muted-foreground">
                                                        <T context="Status in the Cache interface demo.">
                                                            Export &amp; Share
                                                            ready
                                                        </T>
                                                        <span className="pl-3 text-foreground/50">
                                                            <T context="Relative time in the Cache interface demo.">
                                                                now
                                                            </T>
                                                        </span>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </figure>
                        </div>
                    </section>
                    <section className="flex w-full flex-col gap-8 md:gap-10">
                        <div className="flex flex-col gap-3 py-5 md:gap-4">
                            <T>
                                <h2 className="font-medium text-[28px] text-foreground leading-[1.1] tracking-[-1.28px] lg:text-[32px]">
                                    Save with a click,
                                    <br />
                                    <span className="text-muted-foreground">
                                        and AI agents do the rest
                                    </span>
                                </h2>
                                <p className="text-pretty font-medium text-base text-foreground leading-[1.2] tracking-[-3%] opacity-50">
                                    Summarize, research, compare, or draft with
                                    the relevant bookmarks already in context.
                                </p>
                            </T>
                        </div>
                        <div className="relative mx-auto h-[300px] w-full max-w-[640px] sm:h-[360px] sm:max-w-[700px] md:h-[420px]">
                            <div
                                aria-hidden
                                className="absolute bottom-0 left-0 z-10 w-[44%] max-w-[160px] translate-x-3 overflow-hidden rounded-xl shadow-lg/15 sm:w-[200px] sm:max-w-none sm:translate-x-4 sm:rounded-2xl md:w-[230px] md:translate-x-6"
                            >
                                <div className="relative aspect-3/4 w-full">
                                    <Image
                                        alt=""
                                        className="object-cover"
                                        fill
                                        placeholder="blur"
                                        sizes="(max-width: 640px) 44vw, 230px"
                                        src={AiSectionTravelImage}
                                    />
                                    <div className="absolute inset-x-0 bottom-0 hidden bg-linear-to-t from-black/60 to-transparent p-3.5 pt-12 sm:block md:p-4 md:pt-14">
                                        <T>
                                            <p className="font-medium text-[15px] text-white tracking-[-0.3px] md:text-base">
                                                Travel
                                            </p>
                                            <p className="text-white/75 text-xs">
                                                14 items
                                            </p>
                                        </T>
                                    </div>
                                </div>
                            </div>
                            <div
                                aria-hidden
                                className="absolute top-0 right-0 z-10 w-[44%] max-w-[160px] -translate-x-3 overflow-hidden rounded-xl shadow-lg/15 sm:w-[200px] sm:max-w-none sm:-translate-x-4 sm:rounded-2xl md:w-[230px] md:-translate-x-6"
                            >
                                <div className="relative aspect-3/4 w-full">
                                    <Image
                                        alt=""
                                        className="object-cover"
                                        fill
                                        placeholder="blur"
                                        sizes="(max-width: 640px) 44vw, 230px"
                                        src={AiSectionLifestyleImage}
                                    />
                                    <div className="absolute inset-x-0 bottom-0 hidden bg-linear-to-t from-black/60 to-transparent p-3.5 pt-12 sm:block md:p-4 md:pt-14">
                                        <div className="w-fit pl-[38%]">
                                            <T>
                                                <p className="font-medium text-[15px] text-white tracking-[-0.3px] md:text-base">
                                                    Lifestyle
                                                </p>
                                                <p className="text-white/75 text-xs">
                                                    33 items
                                                </p>
                                            </T>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="absolute top-3 left-1/2 z-20 w-[min(78%,250px)] -translate-x-1/2 sm:top-3 sm:w-[min(86%,320px)] md:top-4 md:w-[340px]">
                                <div className="flex h-[270px] flex-col justify-between rounded-[1.25rem] border-4 border-background bg-card p-3 shadow-[0_8px_40px_-12px_rgb(0_0_0/0.35)] sm:h-[330px] sm:rounded-[1.75rem] sm:border-8 sm:p-5 md:h-[380px] md:rounded-[2rem] md:p-7">
                                    <T context="AI agents demo on homepage">
                                        <div className="ml-auto w-fit max-w-[92%] rounded-xl bg-muted px-3 py-2.5 sm:rounded-2xl sm:px-5 sm:py-3.5">
                                            <p className="text-pretty text-left font-medium text-[12px] text-foreground leading-[1.35] tracking-[-0.2px] sm:text-[13px] md:text-[15px]">
                                                What do my bookmarks say about
                                                living a better life?
                                            </p>
                                        </div>
                                        <div className="flex flex-col gap-1.5 sm:gap-2.5 md:gap-3">
                                            <p className="font-medium text-[11px] text-muted-foreground tracking-[-0.2px] sm:text-xs md:text-sm">
                                                Cache AI
                                            </p>
                                            <p className="text-pretty font-medium text-[13px] text-foreground leading-[1.3] tracking-[-0.4px] sm:text-base md:text-lg md:leading-[1.28]">
                                                Your bookmarks suggest a
                                                philosophy of life centered on
                                                deliberate, high-leverage action
                                                and systematic
                                                self-optimization.
                                            </p>
                                        </div>
                                    </T>
                                </div>
                            </div>
                        </div>
                    </section>
                    <section className="flex w-full flex-col gap-8 md:gap-10">
                        <Carousel>
                            <div className="flex items-end justify-between gap-2">
                                <h2
                                    className="font-medium text-[28px] text-foreground leading-[1.1] tracking-[-1.28px] lg:text-[32px]"
                                    id="target-audience-carousel-heading"
                                >
                                    <T context="target audience">
                                        <span className="hidden opacity-50 sm:inline-block">
                                            Use cases
                                            <br />
                                        </span>
                                        <span className="opacity-80">
                                            Work, life, and everything in
                                            between.
                                        </span>{" "}
                                        Cache is for…
                                    </T>
                                </h2>
                                <CarouselControls />
                            </div>
                            <CarouselPanel
                                aria-labelledby="target-audience-carousel-heading"
                                className="pb-10! [&>*:not(:last-child)]:me-4"
                                slideClassName="!w-[300px] md:!w-[340px]"
                            >
                                <div className="flex h-96 flex-col justify-between rounded-2xl border border-border/70 bg-background p-6">
                                    <h3 className="font-medium text-foreground text-lg tracking-[-0.5px]">
                                        <T>Curious readers</T>
                                    </h3>
                                    <p className="text-pretty font-medium text-[15px] text-foreground leading-[1.4] opacity-50">
                                        <T>
                                            Articles, essays, newsletters. A
                                            living library instead of a
                                            read‑later graveyard.
                                        </T>
                                    </p>
                                </div>
                                <div className="flex h-96 flex-col justify-between rounded-2xl border border-border/70 bg-background p-6">
                                    <h3 className="font-medium text-foreground text-lg tracking-[-0.5px]">
                                        <T>Writers and thinkers</T>
                                    </h3>
                                    <p className="text-pretty font-medium text-[15px] text-foreground leading-[1.4] opacity-50">
                                        <T>
                                            References, quotes, snippets. A
                                            searchable research stack for raw
                                            material.
                                        </T>
                                    </p>
                                </div>
                                <div className="flex h-96 flex-col justify-between rounded-2xl border border-border/70 bg-background p-6">
                                    <h3 className="font-medium text-foreground text-lg tracking-[-0.5px]">
                                        <T>Builders and developers</T>
                                    </h3>
                                    <p className="text-pretty font-medium text-[15px] text-foreground leading-[1.4] opacity-50">
                                        <T>
                                            Docs, issues, code, tutorials. Find
                                            that one link when you need it.
                                        </T>
                                    </p>
                                </div>
                                <div className="flex h-96 flex-col justify-between rounded-2xl border border-border/70 bg-background p-6">
                                    <h3 className="font-medium text-foreground text-lg tracking-[-0.5px]">
                                        <T>Creators and curators</T>
                                    </h3>
                                    <p className="text-pretty font-medium text-[15px] text-foreground leading-[1.4] opacity-50">
                                        <T>
                                            Threads, videos, inspiration. Group
                                            ideas into collections and share
                                            them.
                                        </T>
                                    </p>
                                </div>
                                <div className="flex h-96 flex-col justify-between rounded-2xl border border-border/70 bg-background p-6">
                                    <h3 className="font-medium text-foreground text-lg tracking-[-0.5px]">
                                        <T>Productivity</T>
                                    </h3>
                                    <p className="text-pretty font-medium text-[15px] text-foreground leading-[1.4] opacity-50">
                                        <T>
                                            The missing step between bookmarking
                                            and note-taking. Structured,
                                            searchable, always there when you
                                            need it.
                                        </T>
                                    </p>
                                </div>
                            </CarouselPanel>
                        </Carousel>
                    </section>
                    <section className="flex w-full flex-col gap-8 md:gap-10">
                        <div className="flex max-w-prose items-center gap-5">
                            <T>
                                <p className="font-medium text-lg text-muted-foreground tracking-tighter">
                                    <span className="font-normal text-foreground">
                                        You don't have to use Cache
                                        <br />
                                    </span>{" "}
                                    Let your AI agents use it with{" "}
                                    <ModelContextProtocolIcon className="mb-0.5 opacity-60" />{" "}
                                    <Popover>
                                        <PopoverTrigger
                                            nativeButton={false}
                                            openOnHover
                                            render={
                                                <span className="underline-thickness-2 cursor-help underline decoration-dotted underline-offset-4">
                                                    MCP
                                                </span>
                                            }
                                        />
                                        <PopoverPopup side="top">
                                            <div className="max-w-xs text-pretty text-sm">
                                                MCP is a universal connector —
                                                similar to a "USB port" for AI,
                                                but for software. It lets your
                                                AI agents securely access apps
                                                and data, so they can take
                                                actions and get work done for
                                                you — all without you needing to
                                                manually intervene.
                                            </div>
                                        </PopoverPopup>
                                    </Popover>{" "}
                                    and empower them with the full spectrum of
                                    your resources
                                </p>
                            </T>
                        </div>
                    </section>
                    <div className="flex flex-col items-center gap-4 pb-10 md:flex-row md:gap-4 md:pb-0">
                        <p className="select-none font-normal font-sans text-base text-muted-foreground">
                            <T>Ask about the Cache App on</T>
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                aria-label={gt(
                                    "Ask about the Cache App on ChatGPT"
                                )}
                                nativeButton={false}
                                render={
                                    <a
                                        href={ASK_CACHE_CHATGPT_URL}
                                        rel="noopener noreferrer"
                                        target="_blank"
                                    />
                                }
                                size="icon-lg"
                                variant="secondary"
                            >
                                <OpenAIIcon className="size-5 sm:size-4" />
                            </Button>
                            <Button
                                aria-label={gt(
                                    "Ask about the Cache App on Claude"
                                )}
                                nativeButton={false}
                                render={
                                    <a
                                        href={ASK_CACHE_CLAUDE_URL}
                                        rel="noopener noreferrer"
                                        target="_blank"
                                    />
                                }
                                size="icon-lg"
                                variant="secondary"
                            >
                                <ClaudeIcon className="size-5 sm:size-4" />
                            </Button>
                            <Button
                                aria-label={gt(
                                    "Ask about the Cache App on Perplexity"
                                )}
                                nativeButton={false}
                                render={
                                    <a
                                        href={ASK_CACHE_PERPLEXITY_URL}
                                        rel="noopener noreferrer"
                                        target="_blank"
                                    />
                                }
                                size="icon-lg"
                                variant="secondary"
                            >
                                <PerplexityIcon className="size-5 sm:size-4" />
                            </Button>
                            <Button
                                aria-label={gt(
                                    "Ask about the Cache App on Gemini"
                                )}
                                nativeButton={false}
                                render={
                                    <a
                                        href={ASK_CACHE_GEMINI_URL}
                                        rel="noopener noreferrer"
                                        target="_blank"
                                    />
                                }
                                size="icon-lg"
                                variant="secondary"
                            >
                                <GeminiIcon className="size-5 sm:size-4" />
                            </Button>
                            <Button
                                aria-label={gt(
                                    "Ask about the Cache App on Grok"
                                )}
                                nativeButton={false}
                                render={
                                    <a
                                        href={ASK_CACHE_GROK_URL}
                                        rel="noopener noreferrer"
                                        target="_blank"
                                    />
                                }
                                size="icon-lg"
                                variant="secondary"
                            >
                                <GrokIcon className="size-5 sm:size-4" />
                            </Button>
                        </div>
                    </div>
                    <Footer />
                </div>
            </article>
        </PageShell>
    );
}

type IntegrationCardPosition =
    | "left-top"
    | "left-middle"
    | "left-bottom"
    | "right-top"
    | "right-middle"
    | "right-bottom";

function IntegrationCard({
    children,
    className,
    position,
    isCenter = false,
}: {
    children: React.ReactNode;
    className?: string;
    position?: IntegrationCardPosition;
    isCenter?: boolean;
}) {
    return (
        <div
            className={cn(
                "relative flex size-12 rounded-xl border bg-background",
                className
            )}
        >
            <div
                className={cn(
                    "relative z-20 m-auto size-fit *:size-6",
                    isCenter && "*:size-8"
                )}
            >
                {children}
            </div>
            {position && !isCenter && (
                <div
                    className={cn(
                        "absolute z-10 h-px bg-linear-to-r to-muted-foreground/25",
                        position === "left-top" &&
                            "top-1/2 left-full w-[130px] origin-left rotate-25",
                        position === "left-middle" &&
                            "top-1/2 left-full w-[120px] origin-left",
                        position === "left-bottom" &&
                            "top-1/2 left-full w-[130px] origin-left rotate-[-25deg]",
                        position === "right-top" &&
                            "top-1/2 right-full w-[130px] origin-right rotate-[-25deg] bg-linear-to-l",
                        position === "right-middle" &&
                            "top-1/2 right-full w-[120px] origin-right bg-linear-to-l",
                        position === "right-bottom" &&
                            "top-1/2 right-full w-[130px] origin-right rotate-25 bg-linear-to-l"
                    )}
                />
            )}
        </div>
    );
}
