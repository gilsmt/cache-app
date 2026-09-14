"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { cn } from "cn";
import { T } from "gt-next";
import { DownloadIcon } from "lucide-react";
import type { StaticImageData } from "next/image";
import Image from "next/image";
import Link from "next/link";
import * as React from "react";
import {
    ContextMenu,
    ContextMenuItem,
    ContextMenuPopup,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { isAbortError } from "@/lib/common/abort";
import { APP_NAME, IMAGE_MIME_TYPES } from "@/lib/common/constants";
import { saveFile } from "@/lib/common/file";
import { createLogger } from "@/lib/common/logs/console/logger";
import { fetchWithTimeout } from "@/lib/common/timeout";

const FETCH_TIMEOUT_MS = 10_000;

/** Splits an asset URL pathname from its query or hash. */
const QUERY_OR_HASH_PATTERN = /[?#]/;

type ImageFileExtension = keyof typeof IMAGE_MIME_TYPES;

const log = createLogger("ui:brand-logo");

function isImageFileExtension(value: string): value is ImageFileExtension {
    return value in IMAGE_MIME_TYPES;
}

/**
 * Resolves the savable file format from the imported asset URL so saved bytes
 * are never labeled with a mismatched extension.
 */
function getLogoSaveFormat(
    imageUrl: string
): { description: string; extension: ImageFileExtension } | null {
    const pathname = imageUrl.split(QUERY_OR_HASH_PATTERN)[0] ?? "";
    const extension = pathname
        .slice(pathname.lastIndexOf(".") + 1)
        .toLowerCase();
    if (!isImageFileExtension(extension)) {
        return null;
    }
    return {
        description: `${extension.toUpperCase()} image`,
        extension,
    };
}

async function fetchLogo(url: string, signal: AbortSignal): Promise<Blob> {
    const response = await fetchWithTimeout(url, { signal }, FETCH_TIMEOUT_MS);
    if (!response.ok) {
        throw new Error(`Failed to fetch logo image (${response.status})`);
    }
    return response.blob();
}

interface BrandLogoProps
    extends Omit<React.ComponentProps<typeof Link>, "href"> {
    href?: string;
    src: StaticImageData;
}

export function BrandLogo({ href, src, className, ...props }: BrandLogoProps) {
    const abortControllerRef = React.useRef<AbortController | null>(null);

    React.useEffect(() => () => abortControllerRef.current?.abort(), []);

    const handleSaveLogo = useStableCallback(async () => {
        const format = getLogoSaveFormat(src.src);
        if (!format) {
            log.error("Unsupported logo image format", { src: src.src });
            return;
        }

        abortControllerRef.current?.abort();

        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const blob = await fetchLogo(src.src, controller.signal);
            await saveFile(blob, {
                description: format.description,
                extension: format.extension,
                name: "cache-logo",
            });
        } catch (error) {
            if (isAbortError(error)) {
                return;
            }
            log.error("Failed to save logo image", error);
        }
    });

    const logoClassName = cn("w-fit", className);

    const interactiveLogoClassName = cn(
        logoClassName,
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    );

    return (
        <ContextMenu>
            <ContextMenuTrigger
                render={
                    href ? (
                        <Link
                            {...props}
                            className={interactiveLogoClassName}
                            draggable="false"
                            href={href}
                        />
                    ) : (
                        <div className={logoClassName} />
                    )
                }
            >
                <Image
                    alt={APP_NAME}
                    className="block h-auto w-45 select-none"
                    draggable="false"
                    preload
                    sizes="180px"
                    src={src}
                />
            </ContextMenuTrigger>
            <ContextMenuPopup className="min-w-44">
                <ContextMenuItem onClick={handleSaveLogo}>
                    <DownloadIcon className="size-4 text-muted-foreground" />
                    <T>Save logo image</T>
                </ContextMenuItem>
            </ContextMenuPopup>
        </ContextMenu>
    );
}
