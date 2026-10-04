import { T } from "gt-next";
import { ChevronUp } from "lucide-react";
import type * as React from "react";
import { HoverHotkeySurfaceProvider } from "@/components/ui/hover-hotkey-surface";
import { PageShell } from "@/components/ui/page-shell";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ToTopButton } from "@/components/ui/to-top-button";

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
            <ToTopButton>
                <ChevronUp aria-hidden className="size-4.5" focusable="false" />
                <T>Back to top</T>
            </ToTopButton>
        </PageShell>
    );
}
