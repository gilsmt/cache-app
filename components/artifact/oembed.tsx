"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { useTimeout } from "@base-ui/utils/useTimeout";
import { T, useGT } from "gt-next";
import { AlertCircleIcon, ExternalLinkIcon, RotateCcwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useOembed } from "@/components/hooks/queries/use-oembed";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { createLogger } from "@/lib/common/logs/console/logger";
import {
    hasOembedSupport,
    type Oembed as OembedData,
} from "@/lib/common/oembed";
import { isHttpUrl, parseDisplayUrl, parseValidUrl } from "@/lib/common/url";

const PREVIEW_LOADING_TIMEOUT_MS = 8000;

const OEMBED_IFRAME_SANDBOX =
    "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-presentation";
const OEMBED_DIRECT_IFRAME_SANDBOX = `${OEMBED_IFRAME_SANDBOX} allow-same-origin allow-forms allow-modals allow-downloads`;
const OEMBED_IFRAME_ALLOW =
    "accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share";
const OEMBED_SRCDOC_CSP =
    "default-src 'none'; img-src https: data:; font-src https: data:; style-src 'unsafe-inline' https:; script-src 'unsafe-inline' https:; connect-src https:; media-src https: data: blob:; frame-src https:; object-src 'none'; form-action 'none';";

const YOUTUBE_IFRAME_HOSTS = new Set([
    "youtube.com",
    "www.youtube.com",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
]);

type IframeStatus = "loading" | "settled" | "timed-out";

const log = createLogger("artifact:oembed");

function getOembedIframeSrc(oembed: OembedData): string | null {
    const doc = new DOMParser().parseFromString(oembed.html, "text/html");
    const src = doc.querySelector("iframe")?.getAttribute("src");
    const url = src ? parseValidUrl(src) : null;
    return url && isAllowedOembedIframeUrl(url, oembed.provider)
        ? url.href
        : null;
}

function isAllowedOembedIframeUrl(url: URL, provider: string): boolean {
    if (url.protocol !== "https:") {
        return false;
    }
    const hostname = url.hostname.toLowerCase();
    const isPath = (p: string) => url.pathname.startsWith(p);

    switch (provider) {
        case "youtube":
            return YOUTUBE_IFRAME_HOSTS.has(hostname) && isPath("/embed/");
        case "vimeo":
            return hostname === "player.vimeo.com" && isPath("/video/");
        case "spotify":
            return hostname === "open.spotify.com" && isPath("/embed/");
        case "soundcloud":
            return hostname === "w.soundcloud.com";
        case "codepen":
            return hostname === "codepen.io";
        case "codesandbox":
            return hostname === "codesandbox.io";
        case "figma":
            return hostname === "www.figma.com" && url.pathname === "/embed";
        default:
            return false;
    }
}

function buildOembedSrcDocument(html: string): string {
    return `<!doctype html>
<html>
<head>
<base target="_blank">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${OEMBED_SRCDOC_CSP}">
<style>
html,
body {
    align-items: center;
    background: transparent;
    box-sizing: border-box;
    display: flex;
    justify-content: center;
    margin: 0;
    min-height: 100%;
    height: 100%;
    width: 100%;
    padding: 0;
}
*,
*::before,
*::after {
    box-sizing: inherit;
}
iframe {
    border: 0;
    max-height: calc(100vh - 24px);
    max-width: 100%;
}
blockquote {
    max-width: 100%;
    height: 100%;
}
</style>
</head>
<body>${html}</body>
</html>`;
}

interface OembedProps {
    title: string | null;
    url: string;
}

export function Oembed({ title, url }: OembedProps) {
    const gt = useGT();
    const [attempt, setAttempt] = useState(0);

    const isValidUrl = isHttpUrl(url);
    const oembedUrl = isValidUrl && hasOembedSupport(url) ? url : null;

    const { data, mutate } = useOembed(oembedUrl);

    const oembed = data?.resolution === "found" ? data.oembed : null;
    const previewTitle = oembed
        ? (oembed.title ??
          gt("{provider} preview", { provider: oembed.provider }))
        : gt("Preview of {title}", { title: title ?? gt("Preview") });

    const handleRetry = useStableCallback(() => {
        setAttempt((current) => current + 1);
        mutate();
    });

    return (
        <div className="flex size-full min-h-0 flex-col">
            <div className="relative min-h-0 flex-1">
                {isValidUrl ? (
                    <OembedPreview
                        key={JSON.stringify([
                            url,
                            attempt,
                            oembed?.provider,
                            oembed?.html,
                        ])}
                        oembed={oembed}
                        title={previewTitle}
                        url={url}
                    />
                ) : (
                    <OembedBlocked />
                )}
            </div>
            {isValidUrl ? (
                <div className="flex shrink-0 items-center justify-end gap-2 border-t p-2">
                    <Button onClick={handleRetry} size="sm" variant="outline">
                        <RotateCcwIcon className="size-4" />
                        <T>Reload preview</T>
                    </Button>
                    <Button
                        nativeButton={false}
                        render={
                            <a
                                href={url}
                                rel="noopener noreferrer"
                                target="_blank"
                            />
                        }
                        size="sm"
                    >
                        <ExternalLinkIcon className="size-4" />
                        <T>Open in new tab</T>
                    </Button>
                </div>
            ) : null}
        </div>
    );
}

interface OembedPreviewProps {
    oembed: OembedData | null;
    title: string;
    url: string;
}

function OembedPreview({ oembed, title, url }: OembedPreviewProps) {
    const timeout = useTimeout();
    const [status, setStatus] = useState<IframeStatus>("loading");

    const directSrc = oembed ? getOembedIframeSrc(oembed) : null;
    const srcDoc =
        oembed && !directSrc ? buildOembedSrcDocument(oembed.html) : undefined;

    // Cross-origin frames fire load even on failure and do not fire error.
    // Keep recovery controls available after navigation settles.
    const handleLoad = useStableCallback(() => {
        timeout.clear();
        setStatus((current) => (current === "loading" ? "settled" : current));
    });

    useEffect(() => {
        if (status !== "loading") {
            return;
        }
        timeout.start(PREVIEW_LOADING_TIMEOUT_MS, () => {
            log.warn("Preview navigation timed out.", {
                host: parseDisplayUrl(url),
            });
            setStatus("timed-out");
        });
        return () => timeout.clear();
    }, [status, timeout, url]);

    if (status === "timed-out") {
        return <OembedBlocked />;
    }

    return (
        <>
            {status === "loading" ? <OembedLoading /> : null}
            {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: iframe load is a resource lifecycle event. */}
            <iframe
                allow={srcDoc ? undefined : OEMBED_IFRAME_ALLOW}
                allowFullScreen={!srcDoc}
                className="bg-background size-full border-0"
                loading="eager"
                onLoad={handleLoad}
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox={
                    directSrc
                        ? OEMBED_DIRECT_IFRAME_SANDBOX
                        : OEMBED_IFRAME_SANDBOX
                }
                src={srcDoc ? undefined : (directSrc ?? url)}
                srcDoc={srcDoc}
                title={title}
            />
        </>
    );
}

function OembedLoading() {
    return (
        <div
            aria-live="polite"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-center"
            role="status"
        >
            <Spinner className="text-muted-foreground size-5" />
            <div className="space-y-1">
                <p className="text-foreground text-sm font-medium">
                    <T>Loading preview…</T>
                </p>
                <p className="text-muted-foreground max-w-sm text-sm text-balance">
                    <T>Opening the page.</T>
                </p>
            </div>
        </div>
    );
}

function OembedBlocked() {
    return (
        <div
            aria-live="assertive"
            className="flex size-full flex-col items-center justify-center gap-4 px-6 text-center"
            role="alert"
        >
            <div className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full">
                <AlertCircleIcon className="size-5" />
            </div>
            <div className="space-y-2">
                <p className="text-foreground text-base font-medium">
                    <T>Preview unavailable</T>
                </p>
                <p className="text-muted-foreground max-w-md text-sm text-balance">
                    <T>This page could not be displayed.</T>
                </p>
            </div>
        </div>
    );
}
