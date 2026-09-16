"use client";

import { useOnFirstRender } from "@base-ui/utils/useOnFirstRender";
import { CHANGELOG_URL, GITHUB_URL } from "@/lib/common/constants";

const ASCII_ART = `
   ______           __
  / ____/___ ______/ /_  ___
 / /   / __ \`/ ___/ __ \\/ _ \\
/ /___/ /_/ / /__/ / / /  __/
\\____/\\__,_/\\___/_/ /_/\\___/`.trimEnd();

const TAGLINE =
    "Unify your bookmarks across every platform into a single, searchable, actionable library";

const ART_STYLE =
    "color:#33c482;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;line-height:1.15;";
const MUTED_STYLE = "color:#8492A6;font-size:12px;";
const LABEL_STYLE =
    "color:#8492A6;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;";
const LINK_STYLE =
    "color:#33c482;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;";

let hasLoggedConsoleBanner = false;

function logConsoleBanner(version: string): void {
    if (typeof window === "undefined" || hasLoggedConsoleBanner) {
        return;
    }
    hasLoggedConsoleBanner = true;

    console.log(`%c${ASCII_ART}  v${version}`, ART_STYLE);
    console.log(`%c${TAGLINE}`, MUTED_STYLE);
    console.log(
        `%cGITHUB:    %c${GITHUB_URL}\n%cCHANGELOG: %c${CHANGELOG_URL}`,
        LABEL_STYLE,
        LINK_STYLE,
        LABEL_STYLE,
        LINK_STYLE
    );
}

interface ConsoleBannerProps {
    version: string;
}

export function ConsoleBanner({ version }: ConsoleBannerProps) {
    useOnFirstRender(() => {
        logConsoleBanner(version);
    });

    return null;
}
