import { T } from "gt-next";
import { ChevronUp } from "lucide-react";
import type * as React from "react";
import { BackToTopButton } from "@/components/ui/back-to-top-button";
import { HoverHotkeySurfaceProvider } from "@/components/ui/hover-hotkey-surface";
import { PageShell } from "@/components/ui/page-shell";
import { SidebarProvider } from "@/components/ui/sidebar";

export default function ApplicationLayout({
    children,
}: React.PropsWithChildren) {
    return (
        <PageShell className="flex-1 gap-8 lg:flex-row lg:justify-between">
            <SidebarProvider>
                <HoverHotkeySurfaceProvider>
                    {children}
                </HoverHotkeySurfaceProvider>
            </SidebarProvider>
            <BackToTopButton>
                <ChevronUp aria-hidden className="size-4.5" focusable="false" />
                <T>Back to top</T>
            </BackToTopButton>
        </PageShell>
    );
}
