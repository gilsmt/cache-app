import type * as React from "react";
import { PageShell } from "@/components/ui/page-shell";

export default function LegalLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <PageShell>
            <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
                {children}
            </div>
        </PageShell>
    );
}
