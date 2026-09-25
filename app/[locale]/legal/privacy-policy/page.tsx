import { getGT } from "gt-next/server";
import type { Metadata } from "next";
import type React from "react";
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
            "Privacy Policy for {appName} — how we collect, use, and protect personal data.",
            { appName: APP_NAME }
        ),
        keywords: ["privacy policy", "data privacy", APP_NAME],
        locale,
        path: "/legal/privacy-policy",
        title: gt("Privacy Policy"),
    });
}

function LinkText({
    children,
    href,
}: Readonly<{
    children: React.ReactNode;
    href: string;
}>) {
    return (
        <a
            className="text-foreground underline underline-offset-4"
            href={href}
            rel="noopener noreferrer"
            target="_blank"
        >
            {children}
        </a>
    );
}

export default function PrivacyPolicyPage() {
    return (
        <article className="flex flex-col gap-8 text-[0.95rem] text-foreground/90 leading-relaxed">
            <header className="flex flex-col gap-6 text-pretty border-border border-b pb-8">
                <p className="max-w-2xl text-base text-muted-foreground leading-relaxed">
                    This summary explains the main privacy choices behind Cache.
                    The full Privacy Policy below governs.
                </p>
                <div className="grid gap-5 border-border border-t pt-5 text-[0.9rem] text-muted-foreground leading-relaxed sm:grid-cols-2">
                    <p>
                        You choose what enters Cache: bookmarks, notes,
                        collections, and connected-source records you ask us to
                        handle.
                    </p>
                    <p>
                        We use your data to run the product, secure accounts,
                        sync connected sources, process billing, and provide the
                        features you request.
                    </p>
                    <p>
                        AI-assisted features may send relevant saved content and
                        metadata to providers only to generate requested output.
                    </p>
                    <p>
                        We do not sell personal data, use your Cache content for
                        ads, or train generalized AI models on data you submit.
                    </p>
                </div>
                <p className="text-[0.88rem] text-muted-foreground leading-relaxed">
                    Effective April 21, 2026. Third-party services you connect
                    to Cache govern their own privacy practices unless their
                    data is processed inside Cache.
                </p>
            </header>
            <section className="flex flex-col gap-3">
                <h1 className="font-semibold text-2xl text-foreground tracking-tight">
                    Privacy Policy
                </h1>
                <p>
                    This Privacy Policy explains how CachdApp, Inc.
                    (&quot;Cache,&quot; &quot;we,&quot; &quot;us,&quot; or
                    &quot;our&quot;) collects, uses, discloses, and otherwise
                    processes personal data when you use {APP_NAME}, our
                    websites, our browser extension, public shared collection
                    pages, and related services where we act as a data
                    controller.
                </p>
                <p>
                    This Privacy Policy also describes your privacy rights and
                    choices, including how to contact us about your data.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    1. Collection of Personal Data
                </h2>

                <div className="flex flex-col gap-3">
                    <h3 className="font-medium text-base text-foreground">
                        Personal data you provide to us directly
                    </h3>
                    <ul className="list-disc space-y-2 pl-5">
                        <li>
                            <strong>Account and profile information:</strong>{" "}
                            your name, email address, profile image, linked
                            provider identifiers, and session data used to sign
                            you in and keep you authenticated.
                        </li>
                        <li>
                            <strong>Library and content data:</strong>{" "}
                            bookmarks, URLs, titles, captions, thumbnails,
                            notes, collection names and descriptions,
                            timestamps, and similar content you save, import,
                            organize, share, or export through Cache.
                        </li>
                        <li>
                            <strong>Feedback and communications:</strong>{" "}
                            messages you send us, feedback you submit in the
                            product, and related context such as the page where
                            you submitted that feedback.
                        </li>
                        <li>
                            <strong>Billing and subscription data:</strong> plan
                            selection, billing interval, subscription status,
                            Stripe customer and subscription identifiers, and
                            related transaction metadata. Payment card details
                            are processed by Stripe and are not stored directly
                            by Cache.
                        </li>
                    </ul>
                </div>

                <div className="flex flex-col gap-3">
                    <h3 className="font-medium text-base text-foreground">
                        Personal data we receive automatically
                    </h3>
                    <ul className="list-disc space-y-2 pl-5">
                        <li>
                            <strong>
                                Device, browser, and connection information:
                            </strong>{" "}
                            IP address, browser type, user agent, device and
                            operating system signals, time zone, and similar
                            technical information.
                        </li>
                        <li>
                            <strong>Usage and log information:</strong> pages or
                            features used, timestamps, request metadata, error
                            logs, performance data, and troubleshooting
                            information generated when you use the service.
                        </li>
                        <li>
                            <strong>Cookies and similar technologies:</strong>{" "}
                            data used to maintain sessions, protect accounts,
                            remember preferences, and understand product usage,
                            including through analytics providers we use to help
                            operate the service.
                        </li>
                    </ul>
                </div>

                <div className="flex flex-col gap-3">
                    <h3 className="font-medium text-base text-foreground">
                        Personal data we collect from connected accounts and
                        imports
                    </h3>
                    <ul className="list-disc space-y-2 pl-5">
                        <li>
                            <strong>Connected account records:</strong> when you
                            link a provider account, we may receive the
                            provider&apos;s account identifier, basic profile
                            data, OAuth tokens, token expiry times, approved
                            scopes, and other connection metadata needed to keep
                            the integration working.
                        </li>
                        <li>
                            <strong>Imported source data:</strong> when you sync
                            or import from supported sources, we may receive
                            source-specific information such as external item
                            IDs, URLs, titles, captions, thumbnails, filenames,
                            mime types, timestamps, folder or playlist
                            relationships, channel or account metadata, device
                            identifiers, browser profile identifiers, and other
                            metadata returned by the source or sent by the Cache
                            browser extension.
                        </li>
                        <li>
                            <strong>Public collection sharing data:</strong> if
                            you choose to create a public share link, we store a
                            share ID and make the collection name, description,
                            included items, and your account display name
                            available on a read-only page to anyone with the
                            link.
                        </li>
                    </ul>
                </div>

                <div className="flex flex-col gap-3">
                    <h3 className="font-medium text-base text-foreground">
                        AI-assisted feature inputs
                    </h3>
                    <p>
                        If you use AI-assisted features in Cache, such as
                        section descriptions or smart collection suggestions, we
                        may send relevant library item content, URLs,
                        thumbnails, extracted text, and source metadata to our
                        AI service providers so they can generate the requested
                        output on our behalf.
                    </p>
                </div>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    2. Uses of Personal Data
                </h2>
                <p>We use personal data for the following purposes:</p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        To provide, maintain, secure, and improve Cache and the
                        features available through your account.
                    </li>
                    <li>
                        To create and administer your account, authenticate you,
                        and keep your sessions active.
                    </li>
                    <li>
                        To connect third-party accounts, import or sync saved
                        content, and keep your library up to date across
                        supported sources.
                    </li>
                    <li>
                        To let you organize, search, annotate, export, and share
                        your saved content, including through public collection
                        links you intentionally enable.
                    </li>
                    <li>
                        To process subscriptions, billing, checkout, and other
                        payment-related workflows.
                    </li>
                    <li>
                        To generate AI-assisted summaries, categorization, and
                        organizational suggestions when you use those features.
                    </li>
                    <li>
                        To monitor service performance, troubleshoot issues,
                        debug errors, and protect against fraud, abuse,
                        unauthorized access, and security incidents.
                    </li>
                    <li>
                        To respond to feedback, support requests, legal demands,
                        and other communications.
                    </li>
                    <li>
                        To enforce our Terms of Service and comply with
                        applicable law, regulation, legal process, or
                        governmental request.
                    </li>
                    <li>
                        To analyze aggregated or de-identified usage trends so
                        we can understand how Cache is used and improve the
                        product.
                    </li>
                </ul>
                <p>
                    We do not sell personal data. We do not use personal data
                    you submit to Cache to train generalized AI or machine
                    learning models of our own.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    3. How We Disclose Personal Data
                </h2>
                <p>
                    We may disclose personal data to the following categories of
                    recipients:
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <strong>
                            Service providers and infrastructure vendors:
                        </strong>{" "}
                        providers that help us host, operate, authenticate,
                        secure, analyze, support, pay for, or power the service,
                        such as hosting, database, authentication, analytics,
                        payment, logging, and AI vendors.
                    </li>
                    <li>
                        <strong>Connected services at your direction:</strong>{" "}
                        when you choose to link an account, sync a source, open
                        a provider flow, or otherwise ask us to exchange data
                        with a third-party service to complete your request.
                    </li>
                    <li>
                        <strong>Public recipients:</strong> if you enable a
                        public collection share link, anyone with that link may
                        view the content made available on that page. We ask
                        search engines not to index those pages, but we cannot
                        guarantee that a shared link stays private once you
                        distribute it.
                    </li>
                    <li>
                        <strong>
                            Legal, safety, and enforcement recipients:
                        </strong>{" "}
                        where reasonably necessary to comply with law, protect
                        rights or safety, investigate misuse, collect amounts
                        owed, or enforce our agreements.
                    </li>
                    <li>
                        <strong>Business transaction counterparties:</strong> in
                        connection with a merger, acquisition, financing, asset
                        sale, bankruptcy, or similar corporate event, subject to
                        appropriate confidentiality and legal protections.
                    </li>
                </ul>
                <p>
                    We do not sell personal data or disclose it for
                    cross-context behavioral advertising.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    4. Rights and Choices
                </h2>
                <p>
                    Depending on where you live, you may have rights to access,
                    know, correct, delete, port, restrict, or object to our
                    processing of your personal data, subject to applicable law
                    and certain exceptions.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        You can manage some information directly in the product,
                        including deleting saved items, notes, collections, and
                        disabling public collection share links.
                    </li>
                    <li>
                        Deleting an imported item from Cache removes it from
                        Cache only. It does not remove the original item from
                        the third-party service where it was first saved.
                    </li>
                    <li>
                        You can stop future imports from a connected account by
                        revoking Cache&apos;s access in the connected
                        service&apos;s settings or by no longer using that
                        integration.
                    </li>
                    <li>
                        You can control cookies and similar technologies through
                        your browser or device settings, though some features
                        may not work properly if you disable them.
                    </li>
                    <li>
                        To exercise privacy rights that are not available in the
                        product, contact{" "}
                        <LinkText href="mailto:notices@cachd.app">
                            notices@cachd.app
                        </LinkText>
                        . We may need to verify your identity before acting on
                        your request.
                    </li>
                    <li>
                        If you are in the EEA, UK, or other jurisdiction with a
                        supervisory authority, you may lodge a complaint with
                        your local data protection authority about our handling
                        of your personal data.
                    </li>
                </ul>
                <p>
                    Certain requests may be limited where fulfilling them would
                    impair the rights of others, prevent us from providing a
                    service you requested, or conflict with our legal
                    obligations and enforcement of our legal rights.
                </p>
                <p>
                    Some browsers support Do Not Track signals. We currently do
                    not change our data collection practices in response to Do
                    Not Track or similar browser signals.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    5. International Data Transfers
                </h2>
                <p>
                    Cache and our service providers may process personal data in
                    the United States and other countries where we or our
                    providers operate. Those countries may not provide the same
                    level of data protection as your home jurisdiction.
                </p>
                <p>
                    Where required by applicable law, we use contractual or
                    other lawful safeguards designed to protect personal data
                    when it is transferred across borders.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    6. Data Retention and Security
                </h2>
                <p>
                    We retain personal data for as long as reasonably necessary
                    to provide the service and maintain your account. We also
                    retain data as needed to complete the workflows you request,
                    comply with legal, tax, accounting, and security
                    obligations, resolve disputes, and enforce our agreements.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        Account, session, and linked-provider records may remain
                        active while your account is active and while the
                        relevant connection is needed for the service to work.
                    </li>
                    <li>
                        Imported library items, notes, collections, and related
                        metadata remain in Cache until you remove them, close
                        your account, or we no longer need to retain them for a
                        lawful business purpose.
                    </li>
                    <li>
                        Limited data may be retained longer where necessary for
                        fraud prevention, abuse prevention, legal compliance,
                        audit trails, or security investigations.
                    </li>
                </ul>
                <p>
                    We use administrative, technical, and organizational
                    safeguards designed to protect personal data, including
                    access controls, authenticated service requests, secret
                    management, monitoring, and logging. No method of
                    transmission or storage is completely secure, but we cannot
                    guarantee absolute security.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    7. Children&apos;s Privacy
                </h2>
                <p>
                    Cache is not directed to children under 13, and we do not
                    knowingly collect personal data from children under 13. If
                    you believe a child has provided personal data to us, please
                    contact{" "}
                    <LinkText href="mailto:notices@cachd.app">
                        notices@cachd.app
                    </LinkText>{" "}
                    so we can investigate and take appropriate action.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    8. Changes to This Privacy Policy
                </h2>
                <p>
                    We may update this Privacy Policy from time to time. If we
                    make material changes, we will update the effective date at
                    the top of this page and may provide additional notice when
                    appropriate.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    9. Contact Information
                </h2>
                <p>
                    If you have questions, complaints, or requests about this
                    Privacy Policy or our handling of personal data, contact
                    CachdApp, Inc. at{" "}
                    <LinkText href="mailto:notices@cachd.app">
                        notices@cachd.app
                    </LinkText>
                    .
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    10. Links to Other Sites and Services
                </h2>
                <p>
                    Our Service may contain links to websites, browser
                    extensions, and online services operated by third parties.
                    We do not control those third-party services and are not
                    responsible for their privacy practices. We encourage you to
                    review the privacy policies of any third-party service you
                    use in connection with Cache.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    11. Legal Bases for Processing
                </h2>
                <p>
                    If you are in a jurisdiction that requires a legal basis for
                    processing personal data, such as the EEA, UK, or
                    Switzerland, we generally rely on one or more of the
                    following bases:
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <strong>Contract:</strong> where processing is necessary
                        to provide Cache, manage your account, perform imports,
                        and deliver paid features you request.
                    </li>
                    <li>
                        <strong>Legitimate interests:</strong> where processing
                        is necessary to secure, maintain, troubleshoot, improve,
                        and defend the service, provided those interests are not
                        overridden by your rights and interests.
                    </li>
                    <li>
                        <strong>Consent:</strong> where we ask for it, including
                        for certain connected account permissions or other uses
                        that require consent under applicable law.
                    </li>
                    <li>
                        <strong>Legal obligation:</strong> where processing is
                        necessary to comply with legal requirements, lawful
                        requests, or regulatory duties.
                    </li>
                </ul>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    12. Additional Google User Data Disclosures
                </h2>
                <p>
                    If you sign in with Google or connect Google Photos, the
                    following disclosures also apply.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <strong>Google basic profile data:</strong> we may
                        access your Google account identifier, name, email
                        address, and profile image through the Google sign-in
                        scopes <code>openid</code>, <code>email</code>, and{" "}
                        <code>profile</code>.
                    </li>
                    <li>
                        <strong>Google Photos Picker data:</strong> when you use
                        Google Photos import, we request read-only access
                        through the Google Photos Picker scope{" "}
                        <code>
                            https://www.googleapis.com/auth/photospicker.mediaitems.readonly
                        </code>
                        . This allows Cache to create picker sessions, display
                        your selected items, and import the Google Photos items
                        you choose.
                    </li>
                    <li>
                        <strong>Selected item metadata:</strong> for the items
                        you choose to import, we may receive media item IDs,
                        filenames, mime types, creation timestamps, thumbnail
                        URLs, and Google-hosted base or preview URLs returned by
                        Google for those selected items.
                    </li>
                    <li>
                        <strong>How we use Google user data:</strong> only to
                        authenticate your account, maintain the linked
                        connection, create and manage Google Photos Picker
                        sessions, import the items you select, secure the
                        service, and satisfy legal obligations.
                    </li>
                    <li>
                        <strong>What we store:</strong> linked Google account
                        records, approved scopes, access and refresh tokens,
                        token expiry data, and the imported Google Photos
                        library records you ask us to save in Cache.
                    </li>
                    <li>
                        <strong>Our restrictions:</strong> we do not sell Google
                        user data, we do not use Google user data for
                        advertising, and we do not use Google user data to train
                        generalized AI or machine learning models.
                    </li>
                    <li>
                        <strong>Revocation:</strong> you can revoke Cache&apos;s
                        Google access at{" "}
                        <LinkText href="https://myaccount.google.com/permissions">
                            myaccount.google.com/permissions
                        </LinkText>
                        .
                    </li>
                </ul>
                <p>
                    Our use of information received from Google APIs adheres to
                    the{" "}
                    <LinkText href="https://developers.google.com/terms/api-services-user-data-policy">
                        Google API Services User Data Policy
                    </LinkText>
                    , including the Limited Use requirements where applicable.
                </p>
            </section>
        </article>
    );
}
