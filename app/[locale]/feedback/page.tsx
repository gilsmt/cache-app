import { getGT, getLocale } from "gt-next/server";
import type { Metadata } from "next";
import Image from "next/image";
import { buildPageMetadata } from "@/app/metadata";
import { FeedbackEmailSchema } from "@/lib/feedback/schema";
import IconSmallImage from "@/public/cache-icon-small.png";
import { FeedbackForm } from "./feedback-form";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
    const locale = await getLocale();
    const gt = await getGT();

    return {
        ...buildPageMetadata({
            description: gt(
                "Share what didn't work or where Cache didn't meet your expectations."
            ),
            locale,
            path: "/feedback",
            title: gt("Feedback"),
        }),
        robots: {
            follow: false,
            index: false,
        },
    };
}

interface FeedbackPageProps {
    searchParams: Promise<{ email?: string | string[] | undefined }>;
}

export default async function FeedbackPage({
    searchParams,
}: FeedbackPageProps) {
    const gt = await getGT();
    const rawEmail = (await searchParams).email;
    const emailParam = Array.isArray(rawEmail) ? rawEmail[0] : rawEmail;
    const parsedEmail = emailParam
        ? FeedbackEmailSchema.safeParse(emailParam)
        : null;
    const initialEmail = parsedEmail?.success ? parsedEmail.data : undefined;

    return (
        <div className="flex min-h-dvh w-full items-center justify-center px-4 py-12">
            <div className="flex w-full max-w-sm flex-col items-center gap-6">
                <Image
                    alt="Cache"
                    className="select-none"
                    draggable="false"
                    height={36}
                    src={IconSmallImage}
                    width={36}
                />
                <div className="flex flex-col gap-2 text-center">
                    <h1 className="font-semibold text-foreground text-lg">
                        {gt("Thanks for trying Cache")}
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        {gt(
                            "If you have a moment, please share what didn't work or where Cache didn't meet your expectations. Your feedback helps make the Cache App better."
                        )}
                    </p>
                </div>
                <FeedbackForm initialEmail={initialEmail} />
            </div>
        </div>
    );
}
