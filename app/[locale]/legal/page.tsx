import { T } from "gt-next";
import Link from "gt-next/link";
import { getGT } from "gt-next/server";
import { ArrowUpRight, FileText, Scale, Shield } from "lucide-react";
import type { Metadata } from "next";
import { buildPageMetadata } from "@/app/metadata";
import { Separator } from "@/components/ui/separator";
import { APP_NAME } from "@/lib/common/constants";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await params;
    const gt = await getGT();

    return buildPageMetadata({
        description: gt(
            "Legal documents, policies, and disclosures for {appName}.",
            { appName: APP_NAME }
        ),
        keywords: ["legal", "policies", APP_NAME],
        locale,
        path: "/legal",
        title: gt("Legal"),
    });
}

export default function LegalIndexPage() {
    return (
        <div className="relative flex flex-col gap-16">
            <h1 className="text-foreground text-3xl font-semibold tracking-tight sm:text-[2rem] sm:leading-tight">
                <T>Legal and Policies</T>
            </h1>
            <ul className="relative m-0 flex list-none flex-col gap-5 p-0">
                <li>
                    <Link
                        className="group bg-card/80 focus-visible:ring-ring focus-visible:ring-offset-background flex flex-col gap-3 rounded-2xl p-5 shadow-[0_1px_0_0_rgb(255_255_255/0.6)_inset] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:flex-row sm:items-center sm:gap-5 sm:p-6 dark:shadow-[0_1px_0_0_rgb(255_255_255/0.06)_inset]"
                        href="/legal/terms-of-service"
                    >
                        <div className="bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-xl shadow-inner transition-colors duration-200">
                            <Scale aria-hidden className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <span className="text-foreground text-lg font-semibold tracking-tight">
                                    <T>Terms of Service</T>
                                </span>
                            </div>
                            <p className="text-muted-foreground mt-1 text-[0.9rem] leading-relaxed">
                                <T>
                                    Rules governing use of the service,
                                    management of your account, and acceptable
                                    use.
                                </T>
                            </p>
                        </div>
                        <ArrowUpRight
                            aria-hidden
                            className="text-muted-foreground group-hover:text-foreground/90 size-5 shrink-0 sm:mt-0"
                        />
                    </Link>
                </li>
                <li>
                    <Link
                        className="group bg-card/80 focus-visible:ring-ring focus-visible:ring-offset-background flex flex-col gap-3 rounded-2xl p-5 shadow-[0_1px_0_0_rgb(255_255_255/0.6)_inset] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:flex-row sm:items-center sm:gap-5 sm:p-6 dark:shadow-[0_1px_0_0_rgb(255_255_255/0.06)_inset]"
                        href="/legal/privacy-policy"
                    >
                        <div className="bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-xl shadow-inner transition-colors duration-200">
                            <Shield aria-hidden className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <span className="text-foreground text-lg font-semibold tracking-tight">
                                    <T>Privacy Policy</T>
                                </span>
                            </div>
                            <p className="text-muted-foreground mt-1 text-[0.9rem] leading-relaxed">
                                <T>
                                    How we collect, use, and protect personal
                                    information.
                                </T>
                            </p>
                        </div>
                        <ArrowUpRight
                            aria-hidden
                            className="text-muted-foreground group-hover:text-foreground/90 size-5 shrink-0 sm:mt-0"
                        />
                    </Link>
                </li>
                <li>
                    <Link
                        className="group bg-card/80 focus-visible:ring-ring focus-visible:ring-offset-background flex flex-col gap-3 rounded-2xl p-5 shadow-[0_1px_0_0_rgb(255_255_255/0.6)_inset] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:flex-row sm:items-center sm:gap-5 sm:p-6 dark:shadow-[0_1px_0_0_rgb(255_255_255/0.06)_inset]"
                        href="/legal/dpa"
                    >
                        <div className="bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-xl shadow-inner transition-colors duration-200">
                            <FileText aria-hidden className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <span className="text-foreground text-lg font-semibold tracking-tight">
                                    <T>Data Processing Agreement</T>
                                </span>
                            </div>
                            <p className="text-muted-foreground mt-1 text-[0.9rem] leading-relaxed">
                                <T>
                                    How we process and safeguard customer
                                    personal data.
                                </T>
                            </p>
                        </div>
                        <ArrowUpRight
                            aria-hidden
                            className="text-muted-foreground group-hover:text-foreground/90 size-5 shrink-0 sm:mt-0"
                        />
                    </Link>
                </li>
            </ul>
            <Separator />
            <p className="text-muted-foreground relative pt-6 text-[11px]">
                <T>
                    These pages may be updated periodically. The version on this
                    site is the version in effect at the time of your visit.
                </T>
            </p>
        </div>
    );
}
