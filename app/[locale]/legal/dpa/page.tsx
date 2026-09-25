import { getGT } from "gt-next/server";
import type { Metadata } from "next";
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
            "Data Processing Agreement for {appName} — how we process and protect personal data.",
            { appName: APP_NAME }
        ),
        keywords: [
            "data processing agreement",
            "dpa",
            "gdpr",
            "ccpa",
            APP_NAME,
        ],
        locale,
        path: "/legal/dpa",
        title: gt("Data Processing Agreement"),
    });
}

export default function DPAPage() {
    return (
        <article className="flex flex-col gap-8 text-[0.95rem] text-foreground/90 leading-relaxed">
            <header className="flex flex-col gap-6 text-pretty border-border border-b pb-8">
                <h1 className="font-semibold text-3xl text-foreground tracking-tight sm:text-[2.2rem] sm:leading-none">
                    Data Processing Agreement
                </h1>
                <p className="max-w-2xl text-base text-muted-foreground leading-relaxed">
                    This Data Processing Agreement (&quot;DPA&quot;) regulates
                    how we collect, process, and secure customer personal data
                    on behalf of your organization to ensure compliance with
                    global data protection laws.
                </p>
                <div className="grid gap-5 border-border border-t pt-5 text-[0.9rem] text-muted-foreground leading-relaxed sm:grid-cols-2">
                    <p>
                        This DPA acts as a binding supplement to our Terms of
                        Service, outlining commitments to GDPR, CCPA, and
                        standard contractual clauses.
                    </p>
                    <p>
                        We operate primarily as a data processor for the content
                        and bookmarks you save, while maintaining strict
                        organizational and technical security measures.
                    </p>
                    <p>
                        Data transfers outside the EEA or UK are safeguarded
                        through standard contractual clauses (SCCs) to ensure
                        equivalent protection.
                    </p>
                    <p>
                        Our list of sub-processors is transparent and managed to
                        ensure your library data remains secure at all times.
                    </p>
                </div>
                <p className="text-[0.88rem] text-muted-foreground leading-relaxed">
                    Effective April 21, 2026. This DPA governs all processing of
                    Customer Personal Data initiated by the use of {APP_NAME}.
                </p>
            </header>

            <section className="flex flex-col gap-3">
                <p>
                    This Data Processing Agreement (&quot;DPA&quot;) supplements
                    the Terms of Service (the &quot;Agreement&quot;) entered
                    into by and between Customer (as defined in the Agreement)
                    and Cachd.App, Inc., a Delaware corporation
                    (&quot;Provider&quot;, &quot;we&quot;, &quot;us&quot;, or
                    &quot;our&quot;).
                </p>
                <p>
                    By executing the Agreement, Customer enters into this DPA on
                    behalf of itself and, to the extent required under
                    applicable Data Protection Laws, in the name and on behalf
                    of its Affiliates, if any. This DPA incorporates the terms
                    of the Agreement, and any terms not defined in this DPA
                    shall have the meaning set forth in the Agreement.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    1. Definitions
                </h2>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <strong>&quot;Affiliate&quot;</strong> means any entity
                        that directly or indirectly controls, is controlled by,
                        or is under common control with the subject entity.
                    </li>
                    <li>
                        <strong>&quot;Authorized Sub-Processor&quot;</strong>{" "}
                        means a third-party engaged by Provider who has a need
                        to access Customer Personal Data to enable us to perform
                        our obligations under this DPA or the Agreement, as
                        listed in Exhibit B.
                    </li>
                    <li>
                        <strong>&quot;Customer Account Data&quot;</strong> means
                        personal data that relates to Customer&apos;s
                        relationship with Provider, including account
                        credentials, contact information of authorized users,
                        and billing details.
                    </li>
                    <li>
                        <strong>&quot;Customer Usage Data&quot;</strong> means
                        technical usage data collected in connection with the
                        provision of the Services, such as access logs,
                        performance metrics, and security signals.
                    </li>
                    <li>
                        <strong>&quot;Customer Personal Data&quot;</strong>{" "}
                        means any Personal Data provided to us by or on behalf
                        of Customer in the course of using the Services
                        (including bookmarks, note contents, URLs, and
                        metadata).
                    </li>
                    <li>
                        <strong>&quot;Data Protection Laws&quot;</strong> means
                        any applicable laws and regulations relating to the use
                        or processing of Personal Data, including: (i) the EU
                        General Data Protection Regulation (Regulation (EU)
                        2016/679) (&quot;GDPR&quot;), (ii) the UK Data
                        Protection Act 2018, and (iii) the California Consumer
                        Privacy Act (&quot;CCPA&quot;), in each case as updated,
                        amended or replaced from time to time.
                    </li>
                </ul>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    2. Relationship of the Parties; Processing of Data
                </h2>
                <p>
                    The parties acknowledge and agree that with regard to the
                    processing of Customer Personal Data, Customer is the
                    controller and Provider is the processor. Customer shall, in
                    its use of the Services, process Personal Data and provide
                    instructions in compliance with Data Protection Laws.
                </p>
                <p>
                    Provider shall process Customer Personal Data only: (i) to
                    provide the Services in accordance with the Agreement, (ii)
                    in compliance with documented instructions from Customer,
                    and (iii) in accordance with the specifications in Exhibit
                    A.
                </p>
                <p>
                    Following completion of the Services, at Customer&apos;s
                    choice, Provider shall delete or return all Customer
                    Personal Data, unless further storage of such Personal Data
                    is required or authorized by applicable law.
                </p>
                <p>
                    <strong>CCPA compliance:</strong> Provider acts as a service
                    provider under the CCPA. Provider will not sell, retain,
                    use, or disclose Customer Personal Data for any purpose
                    other than for the specific business purposes of performing
                    the Services specified in the Agreement.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    3. Authorized Sub-Processors
                </h2>
                <p>
                    Customer agrees that Provider may engage the Authorized
                    Sub-Processors listed in Exhibit B to access and process
                    Personal Data in connection with the Services.
                </p>
                <p>
                    Provider will update Exhibit B from time to time and will
                    notify Customer of any new sub-processors at least fifteen
                    (15) days before giving such sub-processor access to
                    Customer Personal Data. Customer may object to a new
                    sub-processor in writing on reasonable data protection
                    grounds within ten (10) days of receipt of such notice.
                </p>
                <p>
                    Provider will enter into written agreements with all
                    sub-processors imposing data protection obligations
                    comparable to those in this DPA. Provider remains fully
                    liable to Customer for the performance of its
                    sub-processors&apos; obligations.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    4. Security of Personal Data
                </h2>
                <p>
                    Taking into account the state of the art, the costs of
                    implementation, and the risk of varying likelihood and
                    severity for the rights and freedoms of natural persons,
                    Provider shall maintain appropriate technical and
                    organizational measures to ensure a level of security
                    appropriate to the risk of processing Customer Personal
                    Data.
                </p>
                <p>
                    Exhibit C sets forth additional information about
                    Provider&apos;s technical and organizational security
                    measures.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    5. Transfers of Personal Data
                </h2>
                <p>
                    Customer acknowledges that Provider&apos;s primary
                    processing operations take place in the United States and
                    that the transfer of Customer Personal Data is necessary to
                    provide the Services.
                </p>
                <p>
                    If Provider transfers Customer Personal Data outside the EEA
                    or the UK to a country without an adequacy decision, such
                    transfers will be made pursuant to the European
                    Commission&apos;s Standard Contractual Clauses (EU SCCs) or
                    the UK International Data Transfer Addendum, which are
                    incorporated by reference and deemed completed as of the
                    Effective Date.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    6. Rights of Data Subjects
                </h2>
                <p>
                    Provider shall, to the extent permitted by law, notify
                    Customer if it receives a request from a Data Subject to
                    exercise their rights of access, rectification, erasure,
                    portability, or restriction. Provider will advise the Data
                    Subject to submit their request directly to Customer, and
                    Customer will remain responsible for responding.
                </p>
                <p>
                    Taking into account the nature of processing, Provider will
                    assist Customer with appropriate technical and
                    organizational measures to fulfill Customer&apos;s
                    obligations to respond to Data Subject requests.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    7. Audits and Inspections
                </h2>
                <p>
                    Provider shall maintain records sufficient to demonstrate
                    compliance with its obligations under this DPA.
                </p>
                <p>
                    Upon Customer&apos;s written request at reasonable
                    intervals, and subject to confidentiality controls, Provider
                    shall make available certifications or reports demonstrating
                    compliance with prevailing data security standards (such as
                    SOC2 reports, if available).
                </p>
                <p>
                    In the event of a Personal Data Breach, Provider shall
                    notify Customer without undue delay after becoming aware of
                    the breach, and will take reasonable and necessary steps to
                    remediate and secure Customer Personal Data.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-xl tracking-tight">
                    8. Conflict
                </h2>
                <p>
                    In the event of any conflict or inconsistency between the
                    Terms of Service, this DPA, and the Standard Contractual
                    Clauses, the order of precedence shall be: (1) the Standard
                    Contractual Clauses, (2) the terms of this DPA, and (3) the
                    Terms of Service.
                </p>
            </section>

            <hr className="my-4 border-border" />

            <section className="flex flex-col gap-4">
                <h2
                    className="font-semibold text-foreground text-xl tracking-tight"
                    id="exhibit-a"
                >
                    Exhibit A: Details of Processing
                </h2>
                <div className="flex flex-col gap-3">
                    <p>
                        <strong>
                            Subject Matter and Nature of Processing:
                        </strong>{" "}
                        Provision of a cross-platform bookmarking, organizing,
                        and syncing service to consolidate user bookmarks,
                        notes, and collections.
                    </p>
                    <p>
                        <strong>Duration of Processing:</strong> For the
                        duration of the Agreement and until all Customer
                        Personal Data is deleted in accordance with Section 2.
                    </p>
                    <p>
                        <strong>Categories of Data Subjects:</strong>{" "}
                        Customer&apos;s end-users, employees, and authorized
                        platform members.
                    </p>
                    <p>
                        <strong>Categories of Personal Data:</strong> Library
                        content (bookmarks, custom notes, collection metadata,
                        tags, captured page titles, page content, descriptions,
                        and thumbnails) and account parameters (name, email
                        address, and linked third-party service identifiers).
                    </p>
                </div>
            </section>

            <section className="flex flex-col gap-4">
                <h2
                    className="font-semibold text-foreground text-xl tracking-tight"
                    id="exhibit-b"
                >
                    Exhibit B: List of Authorized Sub-Processors
                </h2>
                <p className="text-muted-foreground text-sm">
                    To deliver the features and capabilities of {APP_NAME}, we
                    partner with the following infrastructure and service
                    vendors:
                </p>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                        <thead>
                            <tr className="border-border border-b">
                                <th className="py-2 pr-4 font-semibold text-foreground">
                                    Company
                                </th>
                                <th className="px-4 py-2 font-semibold text-foreground">
                                    Purpose
                                </th>
                                <th className="py-2 pl-4 font-semibold text-foreground">
                                    Location
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            <tr>
                                <td className="py-3 pr-4 font-medium text-foreground">
                                    Google LLC
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                    Cloud platform, database hosting, and Google
                                    API integration services
                                </td>
                                <td className="py-3 pl-4 text-muted-foreground">
                                    United States
                                </td>
                            </tr>
                            <tr>
                                <td className="py-3 pr-4 font-medium text-foreground">
                                    Stripe, Inc.
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                    Billing, payment processing, and
                                    subscription management
                                </td>
                                <td className="py-3 pl-4 text-muted-foreground">
                                    United States
                                </td>
                            </tr>
                            <tr>
                                <td className="py-3 pr-4 font-medium text-foreground">
                                    Arcjet, Inc.
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                    API security, rate limiting, and sensitive
                                    data redaction
                                </td>
                                <td className="py-3 pl-4 text-muted-foreground">
                                    United States
                                </td>
                            </tr>
                            <tr>
                                <td className="py-3 pr-4 font-medium text-foreground">
                                    Tavily, Inc.
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                    AI search, metadata enrichment, and
                                    information retrieval
                                </td>
                                <td className="py-3 pl-4 text-muted-foreground">
                                    United States
                                </td>
                            </tr>
                            <tr>
                                <td className="py-3 pr-4 font-medium text-foreground">
                                    OpenAI OpCo, LLC
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                    AI-assisted categorizations, summaries, and
                                    smart collection features
                                </td>
                                <td className="py-3 pl-4 text-muted-foreground">
                                    United States
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="flex flex-col gap-4">
                <h2
                    className="font-semibold text-foreground text-xl tracking-tight"
                    id="exhibit-c"
                >
                    Exhibit C: Technical and Organizational Security Measures
                </h2>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                        <thead>
                            <tr className="border-border border-b">
                                <th className="py-2 pr-4 font-semibold text-foreground">
                                    Security Measure
                                </th>
                                <th className="py-2 pl-4 font-semibold text-foreground">
                                    Implementation Details
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            <tr>
                                <td className="py-3 pr-4 align-top font-medium text-foreground">
                                    Encryption of Personal Data
                                </td>
                                <td className="py-3 pl-4 text-muted-foreground">
                                    All data is encrypted in transit using
                                    industry-standard TLS 1.3 encryption.
                                    Storage databases are encrypted at rest
                                    using AES-256 database level policies.
                                </td>
                            </tr>
                            <tr>
                                <td className="py-3 pr-4 align-top font-medium text-foreground">
                                    Logical Instance Separation
                                </td>
                                <td className="py-3 pl-4 text-muted-foreground">
                                    Data is isolated logically at the PostgreSQL
                                    query level to ensure tenant instances and
                                    libraries can never access other accounts
                                    without explicit sharing.
                                </td>
                            </tr>
                            <tr>
                                <td className="py-3 pr-4 align-top font-medium text-foreground">
                                    Backups and Disaster Recovery
                                </td>
                                <td className="py-3 pl-4 text-muted-foreground">
                                    Daily automated database backups are
                                    retained for up to 30 days and tested
                                    regularly to guarantee recovery options in
                                    the event of local infrastructure failures.
                                </td>
                            </tr>
                            <tr>
                                <td className="py-3 pr-4 align-top font-medium text-foreground">
                                    Access Control and 2FA
                                </td>
                                <td className="py-3 pl-4 text-muted-foreground">
                                    Provider employees access core
                                    infrastructure via secure single sign-on
                                    (SSO) with mandatory multi-factor
                                    authentication (MFA/2FA) on all developer
                                    environments.
                                </td>
                            </tr>
                            <tr>
                                <td className="py-3 pr-4 align-top font-medium text-foreground">
                                    Vulnerability Scanning
                                </td>
                                <td className="py-3 pl-4 text-muted-foreground">
                                    Continuous code scanning, dependency
                                    auditing, and Biome linting checks are
                                    integrated directly into our build and
                                    deployment pipeline to block potential
                                    threats.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>
        </article>
    );
}
