import { T } from "gt-next";
import Link from "next/link";
import { GDPRIcon } from "@/components/ui/icons";

export function Footer() {
    return (
        <footer className="content-auto">
            <div className="relative mx-auto mt-auto grid h-auto w-full max-w-5xl grid-cols-12 gap-x-[min(2.25vw,32px)] pt-30 lg:top-0">
                <div className="relative z-20 col-span-full mx-auto grid w-full grid-cols-12 flex-col gap-6 gap-x-[min(2.25vw,32px)]">
                    <div className="col-span-full flex flex-col gap-4">
                        <div className="col-span-full flex h-full flex-row flex-wrap gap-6 text-[0.8rem] text-foreground leading-[1.22] tracking-[-3%]">
                            <div className="flex flex-row flex-wrap gap-6 [&:has(a:hover,a:focus-visible)_a:focus-visible]:opacity-100 [&:has(a:hover,a:focus-visible)_a:hover]:opacity-100 [&:has(a:hover,a:focus-visible)_a]:opacity-25 [&_a:focus-visible]:opacity-100 [&_a:hover]:opacity-100 [&_a]:opacity-50 [&_a]:transition-opacity [&_a]:duration-300">
                                <Link
                                    className="underline"
                                    href="https://docs.cachd.app"
                                    rel="noopener noreferrer"
                                    target="_blank"
                                >
                                    <p>
                                        <T>Docs</T>
                                    </p>
                                </Link>
                                <Link
                                    className="underline"
                                    href="/legal/terms-of-service"
                                    rel="noopener noreferrer"
                                    target="_blank"
                                >
                                    <p>
                                        <T>Terms of Service</T>
                                    </p>
                                </Link>
                                <Link
                                    className="underline"
                                    href="/legal/privacy-policy"
                                    rel="noopener noreferrer"
                                    target="_blank"
                                >
                                    <p>
                                        <T>Privacy</T>
                                    </p>
                                </Link>
                                <Link
                                    className="underline"
                                    href="/security"
                                    rel="noopener noreferrer"
                                    target="_blank"
                                >
                                    <p>
                                        <T>Security</T>
                                    </p>
                                </Link>
                                <Link
                                    className="underline"
                                    href="/github"
                                    rel="noopener noreferrer"
                                    target="_blank"
                                >
                                    <p>GitHub</p>
                                </Link>
                            </div>
                            <p className="opacity-50">
                                <T>
                                    Copyright &copy; Cache App. All rights
                                    reserved.
                                </T>
                            </p>
                            <div className="flex items-center gap-1 opacity-50">
                                <GDPRIcon />
                                <span>GDPR</span>
                            </div>
                        </div>
                    </div>
                    <div className="relative col-span-full flex flex-col items-start justify-between font-sans text-foreground text-xs leading-[1.22] tracking-[-3%] opacity-50">
                        <span className="opacity-90">
                            <T context="Disclaimer">
                                Third-party platforms you connect through the
                                Service are operated independently of Cache.
                                Cache does not control their policies or how
                                they apply them, and is not responsible for
                                decisions those platforms make regarding your
                                accounts or access to their services—including,
                                without limitation, changes to
                                availability—whether or not related to your use
                                of Cache. You are responsible for complying with
                                each platform's terms, policies, and community
                                guidelines. Cache is not liable for any
                                inconvenience, loss, or other outcome arising
                                from your relationship with those platforms or
                                your use of the Service in connection with them.
                            </T>
                        </span>
                        <div className="relative inset-x-0 h-25 w-full overflow-clip sm:h-25 md:h-50">
                            <svg
                                className="overflow-fade-bottom mx-auto flex h-auto w-full justify-center"
                                fill="none"
                                height="200"
                                role="presentation"
                                viewBox="0 0 426 200"
                                width="426"
                            >
                                <rect
                                    className="origin-top fill-foreground transition-transform duration-300 hover:scale-95"
                                    height="100"
                                    rx="30"
                                    width="100"
                                    y="50"
                                />
                                <rect
                                    className="origin-top fill-foreground transition-transform duration-300 hover:scale-95"
                                    height="100"
                                    rx="48"
                                    width="100"
                                    x="108.667"
                                    y="50"
                                />
                                <rect
                                    className="origin-top fill-foreground transition-transform duration-300 hover:scale-95"
                                    height="100"
                                    rx="28"
                                    width="100"
                                    x="217.333"
                                    y="50"
                                />
                                <rect
                                    className="origin-top fill-foreground transition-transform duration-300 hover:scale-95"
                                    height="100"
                                    rx="38"
                                    width="100"
                                    x="326"
                                    y="50"
                                />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
}
