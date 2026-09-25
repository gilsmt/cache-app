import { getGT } from "gt-next/server";
import type { Metadata } from "next";
import Link from "next/link";
import { buildPageMetadata } from "@/app/metadata";
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
            "Terms of Service for {appName} — rules for using the service, accounts, and acceptable use.",
            { appName: APP_NAME }
        ),
        keywords: ["terms of service", "terms", APP_NAME],
        locale,
        path: "/legal/terms-of-service",
        title: gt("Terms of Service"),
    });
}

export default function TermsOfServicePage() {
    return (
        <article className="flex flex-col gap-8 text-[0.95rem] text-foreground/90 leading-relaxed">
            <header className="flex flex-col gap-3">
                <h1 className="font-semibold text-2xl text-foreground tracking-tight">
                    Cache App Terms of Service
                </h1>
                <p>
                    <strong>Last Updated:</strong> March 31, 2026
                </p>
                <p>
                    If you signed a separate Cover Page to access the Product
                    with the same account, and that agreement has not ended, the
                    terms below do not apply to you. Instead, your separate
                    Cover Page applies to your use of the Product.
                </p>
                <p>
                    This Agreement is between Cachd.App, Inc. and the company or
                    person accessing or using the Product. This Agreement
                    consists of: (1) the Order Form below and (2) the Framework
                    Terms defined below.
                </p>
                <p>
                    If you are accessing or using the Product on behalf of your
                    company, you represent that you are authorized to accept
                    this Agreement on behalf of your company. By signing up,
                    accessing, or using the Product, Customer accepts this
                    Agreement and agrees to be bound by its terms and
                    conditions.
                </p>
                <p>
                    <strong>Your Privacy:</strong> Please see our{" "}
                    <Link
                        className="text-foreground underline underline-offset-4"
                        href="/legal/privacy-policy"
                    >
                        Privacy Policy
                    </Link>{" "}
                    for information about how we collect, use, and share your
                    personal data. By using the Product, you consent to the
                    practices described in the Privacy Policy.
                </p>
            </header>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    Cover Page
                </h2>

                <div className="flex flex-col gap-3">
                    <h3 className="font-semibold text-foreground text-lg">
                        Order Form
                    </h3>

                    <p>
                        <strong>Framework Terms:</strong> This Order Form
                        incorporates and is governed by the Framework Terms that
                        are made up of the Key Terms below and the Common Paper{" "}
                        <a
                            className="text-foreground underline underline-offset-4"
                            href="https://commonpaper.com/standards/cloud-service-agreement/2.1/"
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            Cloud Service Agreement Standard Terms Version 2.1
                        </a>
                        , which are incorporated by reference. Any modifications
                        to the Standard Terms made in the Cover Page will
                        control over conflicts with the Standard Terms.
                        Capitalized words have the meanings given in the Cover
                        Page or the Standard Terms.
                    </p>

                    <p>
                        <strong>Cloud Service:</strong> The Cloud Service is a
                        cross-platform bookmarking and content library that
                        aggregates, organizes, and surfaces the user&apos;s
                        saved links and media from supported third-party
                        platforms in a single interface, including via browser
                        extensions and connected accounts.
                    </p>

                    <p>
                        <strong>Order Date:</strong> The Effective Date
                    </p>

                    <p>
                        <strong>Subscription Period:</strong> 1 month
                    </p>

                    <p>
                        Certain parts of the Product have different pricing
                        plans. Customer will pay Provider the applicable Fees
                        based on the Product tier and Customer&apos;s usage.
                        Provider may update Product pricing by giving at least
                        36 days' notice to Customer (including by email or
                        notification within the Product), and the change will
                        apply in the next Subscription Period.
                    </p>

                    <div className="flex flex-col gap-2">
                        <p>
                            <strong>Payment Process:</strong>
                        </p>
                        <p>
                            <strong>Automatic payment:</strong> Customer
                            authorizes Provider to bill and charge
                            Customer&apos;s payment method on file Monthly for
                            immediate payment or deduction without further
                            approval.
                        </p>
                    </div>

                    <p>
                        <strong>Non-Renewal Notice Period:</strong> At least 30
                        days before the end of the current Subscription Period.
                    </p>
                </div>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    Key Terms
                </h2>

                <div className="flex flex-col gap-3">
                    <p>
                        <strong>Customer:</strong> The company or person who
                        accesses or uses the Product. If the person accepting
                        this Agreement is doing so on behalf of a company, all
                        use of the word &quot;Customer&quot; in the Agreement
                        will mean that company.
                    </p>
                    <p>
                        <strong>Provider:</strong> Cachd.App, Inc.
                    </p>
                    <p>
                        <strong>Effective Date:</strong> The date Customer first
                        accepts this Agreement.
                    </p>
                    <p>
                        <strong>Governing Law:</strong> The laws of the State of
                        Delaware
                    </p>
                    <p>
                        <strong>Chosen Courts:</strong> The state or federal
                        courts located in Delaware
                    </p>
                    <div className="flex flex-col gap-2">
                        <p>
                            <strong>Covered Claims:</strong>
                        </p>
                        <p>
                            <strong>Provider Covered Claims:</strong> Any
                            action, proceeding, or claim that the Cloud Service,
                            when used by Customer according to the terms of the
                            Agreement, violates, misappropriates, or otherwise
                            infringes upon anyone else&apos;s intellectual
                            property or other proprietary rights.
                        </p>
                        <p>
                            <strong>Customer Covered Claims:</strong> Any
                            action, proceeding, or claim that (1) the Customer
                            Content, when used according to the terms of the
                            Agreement, violates, misappropriates, or otherwise
                            infringes upon anyone else&apos;s intellectual
                            property or other proprietary rights; or (2) results
                            from Customer&apos;s breach or alleged breach of
                            Section 2.1 (Restrictions on Customer).
                        </p>
                    </div>
                    <p>
                        <strong>General Cap Amount:</strong> The fees paid or
                        payable by Customer to Provider in the 12-month period
                        immediately before the claim
                    </p>
                    <div className="flex flex-col gap-2">
                        <p>
                            <strong>Notice Address:</strong>
                        </p>
                        <p>
                            <strong>For Provider:</strong> notices@cachd.app
                        </p>
                        <p>
                            <strong>For Customer:</strong> The main email
                            address on Customer&apos;s account
                        </p>
                    </div>
                </div>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    Attachments and Supplements
                </h2>
                <p>
                    <strong>DPA:</strong>{" "}
                    <Link
                        className="text-foreground underline underline-offset-4"
                        href="/legal/dpa"
                    >
                        /legal/dpa
                    </Link>
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    Copyright Infringement and DMCA Policy
                </h2>
                <p>
                    We respect the intellectual property rights of others. If
                    you believe that any content available on or through the
                    Product infringes your copyright, you may notify our
                    Designated Copyright Agent in accordance with the Digital
                    Millennium Copyright Act (DMCA).
                </p>
                <p>
                    To be effective, your notification must include the
                    following in writing:
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        A physical or electronic signature of a person
                        authorized to act on behalf of the owner of an exclusive
                        right that is allegedly infringed.
                    </li>
                    <li>
                        Identification of the copyrighted work claimed to have
                        been infringed, or, if multiple copyrighted works are
                        covered by a single notification, a representative list
                        of such works.
                    </li>
                    <li>
                        Identification of the material that is claimed to be
                        infringing and information reasonably sufficient to
                        permit us to locate the material.
                    </li>
                    <li>
                        Information reasonably sufficient to permit us to
                        contact you, such as an address, telephone number, and
                        email address.
                    </li>
                    <li>
                        A statement that you have a good faith belief that use
                        of the material in the manner complained of is not
                        authorized by the copyright owner, its agent, or the
                        law.
                    </li>
                    <li>
                        A statement that the information in the notification is
                        accurate, and under penalty of perjury, that you are
                        authorized to act on behalf of the owner of an exclusive
                        right that is allegedly infringed.
                    </li>
                </ul>
                <p>
                    <strong>Designated Copyright Agent:</strong>
                </p>
                <p>Email: notices@cachd.app</p>
                <p>
                    Upon receipt of a valid notice, we will remove or disable
                    access to the allegedly infringing material and take
                    reasonable steps to notify the user who posted it.
                </p>
                <p>
                    <strong>Counter-Notice:</strong> If you believe that
                    material you posted was removed or disabled as a result of a
                    mistake or misidentification, you may send a written
                    counter-notice to our Designated Copyright Agent containing
                    your physical or electronic signature, identification of the
                    material removed and its location before removal, a
                    statement under penalty of perjury that you have a good
                    faith belief the material was removed or disabled as a
                    result of mistake or misidentification, and your name,
                    address, telephone number, and a statement that you consent
                    to the jurisdiction of the federal court in the District of
                    Delaware and will accept service of process from the party
                    who filed the original notice.
                </p>
                <p>
                    <strong>Repeat Infringers:</strong> We may, in appropriate
                    circumstances and at our sole discretion, terminate the
                    accounts of users who are repeat infringers of intellectual
                    property rights.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    AI-Assisted Features
                </h2>
                <p>
                    The Product may offer optional AI-assisted features, such as
                    automated categorization, smart collection suggestions, or
                    AI-generated descriptions. These features are powered by
                    third-party AI service providers. When you use an
                    AI-assisted feature, relevant library content, URLs,
                    metadata, or other input you provide may be transmitted to
                    our AI service providers to generate the requested output on
                    our behalf.
                </p>
                <p>
                    Per our agreements with these providers, data submitted
                    through the Product for AI-assisted features is not used by
                    them to train or improve their generalized models. We do not
                    use your content to train our own generalized AI or machine
                    learning models.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    Notice for California Users
                </h2>
                <p>
                    Under California Civil Code Section 1789.3, users of the
                    Service from California are entitled to the following
                    consumer rights notice: The Complaint Assistance Unit of the
                    Division of Consumer Services of the California Department
                    of Consumer Affairs may be contacted in writing at 1625
                    North Market Blvd., Suite N 112, Sacramento, CA 95834, or by
                    telephone at (800) 952-5210. You may contact us at
                    notices@cachd.app.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    Contact Information
                </h2>
                <p>
                    If you have any questions about these Terms of Service,
                    please contact us at:
                </p>
                <p>Email: notices@cachd.app</p>
            </section>
        </article>
    );
}
