import { getGT } from "gt-next/server";
import type { Metadata } from "next";
import { buildPageMetadata } from "@/app/metadata";
import { APP_NAME, NOTICES_ADDRESS } from "@/lib/common/constants";

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
        <article className="text-foreground/90 flex flex-col gap-8 text-[0.95rem] leading-relaxed">
            <header className="border-border flex flex-col gap-6 border-b pb-8 text-pretty">
                <h1 className="text-foreground text-3xl font-semibold tracking-tight sm:text-[2.2rem] sm:leading-none">
                    Data Processing Agreement
                </h1>
                <p className="text-muted-foreground max-w-2xl text-base leading-relaxed">
                    This Data Processing Agreement (&quot;DPA&quot;) describes
                    how Cachd.App, Inc. processes Customer Personal Data for
                    organizations that use the hosted service.
                </p>
                <div className="border-border text-muted-foreground grid gap-5 border-t pt-5 text-[0.9rem] leading-relaxed sm:grid-cols-2">
                    <p>
                        This DPA supplements the Terms of Service when we
                        process personal data on an organization&apos;s
                        documented instructions.
                    </p>
                    <p>
                        The organization determines why and how its personal
                        data is processed. We process that data to provide the
                        requested Cache features.
                    </p>
                    <p>
                        If a transfer requires additional contractual terms, the
                        parties must complete and sign the applicable transfer
                        documents.
                    </p>
                    <p>
                        Sub-processors and infrastructure depend on the hosted
                        service configuration. Contact us for the current
                        production list and processing locations.
                    </p>
                </div>
                <p className="text-muted-foreground text-[0.88rem] leading-relaxed">
                    Effective November 2, 2026. This DPA applies to the hosted
                    service only. It does not apply to software you self-host or
                    operate.
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
                    This DPA applies when Customer uses the hosted service and
                    Provider processes Customer Personal Data on Customer&apos;s
                    documented instructions. Customer enters into this DPA on
                    behalf of itself and, where applicable, its Affiliates.
                    Provider acts as an independent controller for personal data
                    it processes for its own business purposes, including
                    managing Customer&apos;s contract and subscription, billing
                    Customer, answering direct inquiries about Provider&apos;s
                    own products, service security, and legal compliance. A data
                    field is Customer Personal Data when Provider processes it
                    on Customer&apos;s documented instructions, even if the same
                    type of data is also used for Provider&apos;s own purposes.
                    This DPA does not cover Provider&apos;s own billing and
                    business records, or a self-hosted instance. Terms not
                    defined in this DPA have the meanings given in the
                    Agreement.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="text-foreground text-xl font-semibold tracking-tight">
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
                        our obligations under this DPA or the Agreement, and
                        identified under Section 3.
                    </li>
                    <li>
                        <strong>&quot;Customer Personal Data&quot;</strong>{" "}
                        means Personal Data that Customer or its Users provide
                        to the Services, or that Provider generates through
                        Customer&apos;s use of the Services, to the extent
                        Provider processes it on Customer&apos;s documented
                        instructions. It excludes data Provider processes solely
                        for its own purposes as a controller under the Privacy
                        Policy.
                    </li>
                    <li>
                        <strong>&quot;Data Protection Laws&quot;</strong> means
                        any applicable laws and regulations relating to the use
                        or processing of Personal Data, including: (i) the EU
                        General Data Protection Regulation (Regulation (EU)
                        2016/679) (&quot;EU GDPR&quot;), (ii) the UK GDPR and
                        Data Protection Act 2018, and (iii) the California
                        Consumer Privacy Act, as amended by the California
                        Privacy Rights Act (&quot;CCPA&quot;), in each case as
                        updated, amended or replaced from time to time.
                    </li>
                    <li>
                        <strong>&quot;Data Subject&quot;</strong> means an
                        identified or identifiable natural person whose Personal
                        Data is processed.
                    </li>
                    <li>
                        <strong>&quot;Personal Data Breach&quot;</strong> means
                        a breach of security that leads to the accidental or
                        unlawful destruction, loss, alteration, unauthorized
                        disclosure of, or access to Customer Personal Data.
                    </li>
                    <li>
                        <strong>&quot;Services&quot;</strong> means the hosted
                        Cloud Service and related services provided by Provider
                        under the Agreement.
                    </li>
                </ul>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="text-foreground text-xl font-semibold tracking-tight">
                    2. Relationship of the Parties; Processing of Data
                </h2>
                <p>
                    For Customer Personal Data processed on Customer&apos;s
                    behalf, Customer acts as the controller or processor, as
                    applicable, and Provider acts as the processor or
                    sub-processor. Customer is responsible for the lawfulness of
                    its instructions and for giving any required notices to data
                    subjects.
                </p>
                <p>
                    Provider will process Customer Personal Data only on
                    Customer&apos;s documented instructions, including
                    instructions about international transfers, and only to
                    provide the Services described in Exhibit A, unless the law
                    to which Provider is subject requires other processing. In
                    that case, Provider will inform Customer of that legal
                    requirement before processing unless the law prohibits the
                    notice on important grounds of public interest. If Provider
                    believes an instruction violates Data Protection Laws, it
                    will inform Customer unless the law prohibits that notice.
                </p>
                <p>
                    Provider will ensure that people authorized to process
                    Customer Personal Data are bound by confidentiality
                    obligations. Provider will not use Customer Personal Data to
                    train, fine-tune, or improve generalized AI or machine
                    learning models. AI providers may process Customer Personal
                    Data only as needed to provide an AI feature requested by
                    Customer or its Users.
                </p>
                <p>
                    At the end of the Services, Provider will, at
                    Customer&apos;s choice, return or delete Customer Personal
                    Data within 60 days, unless applicable law requires its
                    retention. Copies held in routine backups will remain
                    protected under this DPA and be deleted under the applicable
                    backup retention schedule.
                </p>
                <p>
                    Where the CCPA applies and Provider acts as a service
                    provider or contractor, Provider will not sell or share
                    Customer Personal Data, or retain, use, or disclose it
                    outside the specified business purposes and direct business
                    relationship, except as permitted by the CCPA. Provider will
                    not combine Customer Personal Data with information from
                    other sources except as permitted by that law.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="text-foreground text-xl font-semibold tracking-tight">
                    3. Authorized Sub-Processors
                </h2>
                <p>
                    Customer gives Provider general written authorization to
                    engage only sub-processors identified by legal entity,
                    processing location, and purpose in Exhibit B or in a
                    written schedule provided to Customer. A provider category
                    or trade name alone does not identify an authorized
                    sub-processor. Provider will give Customer the current
                    schedule when Customer accepts this DPA, and the
                    sub-processors listed in that schedule are authorized as of
                    acceptance, subject to Customer&apos;s right to object under
                    this Section.
                </p>
                <p>
                    Provider will update the applicable schedule and notify
                    Customer of any new or replacement sub-processor at least
                    fifteen (15) days before giving it access to Customer
                    Personal Data. Customer may object in writing on reasonable
                    data protection grounds to a sub-processor in the initial
                    schedule or a new or replacement sub-processor within ten
                    (10) days of receiving the applicable schedule or notice. If
                    Customer does not object within that period, the
                    sub-processor is authorized under this general
                    authorization. Provider will not give a new or replacement
                    sub-processor access while a timely objection remains
                    unresolved. If the parties cannot resolve a reasonable
                    objection, either party may terminate the affected Services
                    by written notice.
                </p>
                <p>
                    Provider will enter into written agreements with all
                    sub-processors imposing data protection obligations that
                    protect Customer Personal Data to a standard no less
                    protective than this DPA. Provider remains responsible to
                    Customer for each sub-processor&apos;s performance of those
                    obligations.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="text-foreground text-xl font-semibold tracking-tight">
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
                    Exhibit C describes the application-level measures
                    implemented by the hosted service. Hosting, database,
                    backup, and encryption-at-rest controls depend on the
                    infrastructure provider and production configuration. We
                    will provide the current infrastructure details and
                    available security information on written request.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="text-foreground text-xl font-semibold tracking-tight">
                    5. Transfers of Personal Data
                </h2>
                <p>
                    Provider and its sub-processors may process Customer
                    Personal Data in the United States and other countries where
                    the hosted service and its providers operate.
                </p>
                <p>
                    Where Data Protection Laws require an additional transfer
                    safeguard, the parties will put the applicable safeguard in
                    place before the transfer. This may include the EU Standard
                    Contractual Clauses with the correct module and completed
                    appendices, or the UK International Data Transfer Agreement
                    or Addendum with its required tables completed. The parties
                    will also complete any transfer risk assessment and add any
                    safeguards required by law. This DPA does not incorporate
                    blank transfer documents or treat them as completed.
                    Provider will make the applicable transfer documents and
                    information available on request.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="text-foreground text-xl font-semibold tracking-tight">
                    6. Rights of Data Subjects
                </h2>
                <p>
                    Provider shall, to the extent permitted by law, notify
                    Customer if it receives a request from a Data Subject to
                    exercise their rights of access, rectification, erasure,
                    portability, restriction, or objection. Provider will advise
                    the Data Subject to submit their request directly to
                    Customer, and Customer will remain responsible for
                    responding.
                </p>
                <p>
                    Taking into account the nature of processing, Provider will
                    assist Customer with appropriate technical and
                    organizational measures to fulfill Customer&apos;s
                    obligations to respond to Data Subject requests.
                </p>
                <p>
                    Taking into account the nature of processing and information
                    available to Provider, Provider will also assist Customer
                    with its obligations concerning security, Personal Data
                    Breaches, data protection impact assessments, and prior
                    consultation with supervisory authorities.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="text-foreground text-xl font-semibold tracking-tight">
                    7. Audits and Inspections
                </h2>
                <p>
                    Provider shall maintain records sufficient to demonstrate
                    compliance with its obligations under this DPA.
                </p>
                <p>
                    Upon Customer&apos;s written request, Provider will make
                    information reasonably necessary to demonstrate compliance
                    available to Customer. Customer may audit Provider&apos;s
                    processing of Customer Personal Data, including through a
                    qualified auditor, at reasonable intervals and after
                    reasonable notice. Audits are subject to confidentiality
                    obligations and must not unreasonably disrupt the Services
                    or Provider&apos;s operations.
                </p>
                <p>
                    In the event of a Personal Data Breach, Provider shall
                    notify Customer without undue delay after becoming aware of
                    the breach. Provider will share the information available to
                    it that Customer reasonably needs to meet its legal
                    obligations, cooperate in the investigation, and take
                    reasonable steps to contain and remediate the breach.
                </p>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="text-foreground text-xl font-semibold tracking-tight">
                    8. Conflict
                </h2>
                <p>
                    In the event of any conflict or inconsistency between the
                    Terms of Service, this DPA, and any executed transfer
                    safeguard, the executed transfer safeguard controls for the
                    transfer it covers, followed by this DPA, then the Terms of
                    Service.
                </p>
            </section>

            <hr className="border-border my-4" />

            <section className="flex flex-col gap-4">
                <h2
                    className="text-foreground text-xl font-semibold tracking-tight"
                    id="exhibit-a"
                >
                    Exhibit A: Details of Processing
                </h2>
                <div className="flex flex-col gap-3">
                    <p>
                        <strong>
                            Subject Matter and Nature of Processing:
                        </strong>{" "}
                        Operation of the hosted Cache service, including
                        importing, organizing, searching, sharing, exporting,
                        and syncing saved content; providing user-requested AI
                        features; and delivering support and security functions.
                    </p>
                    <p>
                        <strong>Duration of Processing:</strong> For the
                        duration of the Agreement and, after termination, for up
                        to 60 days while Provider returns or deletes the
                        Customer Personal Data under Section 2, except for
                        copies retained as allowed by law or in routine backups.
                    </p>
                    <p>
                        <strong>Categories of Data Subjects:</strong>{" "}
                        Customer&apos;s account holders and authorized users,
                        and people whose personal data Customer includes in
                        saved content or other Customer Personal Data.
                    </p>
                    <p>
                        <strong>Categories of Personal Data:</strong> Account
                        identifiers, names, email addresses, profile details,
                        session and connection identifiers, integration tokens
                        and scopes, IP address and browser metadata; saved URLs,
                        titles, captions, page content, images, thumbnails,
                        notes, comments, tags, collections, chat prompts and
                        responses, automation settings and run results; and
                        source metadata and timestamps.
                    </p>
                </div>
            </section>

            <section className="flex flex-col gap-4">
                <h2
                    className="text-foreground text-xl font-semibold tracking-tight"
                    id="exhibit-b"
                >
                    Exhibit B: Sub-Processor Schedule
                </h2>
                <p className="text-muted-foreground text-sm">
                    The hosted service can use the providers and provider
                    categories below when the related feature is enabled. This
                    table does not identify every provider&apos;s legal entity
                    or processing location. Provider will give Customer the
                    current written schedule with those details and each
                    provider&apos;s purpose when Customer accepts this DPA, and
                    will update it under Section 3 before a new or replacement
                    provider accesses Customer Personal Data. Only the providers
                    identified in the current schedule are authorized under
                    Section 3. Contact{" "}
                    <a
                        className="text-foreground underline underline-offset-4"
                        href={`mailto:${NOTICES_ADDRESS}`}
                    >
                        {NOTICES_ADDRESS}
                    </a>{" "}
                    for the current production provider names and processing
                    locations.
                </p>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                        <thead>
                            <tr className="border-border border-b">
                                <th className="text-foreground py-2 pr-4 font-semibold">
                                    Provider
                                </th>
                                <th className="text-foreground px-4 py-2 font-semibold">
                                    Purpose and use
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-border divide-y">
                            <tr>
                                <td className="text-foreground py-3 pr-4 align-top font-medium">
                                    Google
                                </td>
                                <td className="text-muted-foreground px-4 py-3">
                                    Google sign-in, Google Photos import, and
                                    Gemini model processing when configured.
                                </td>
                            </tr>
                            <tr>
                                <td className="text-foreground py-3 pr-4 align-top font-medium">
                                    Vercel AI Gateway
                                </td>
                                <td className="text-muted-foreground px-4 py-3">
                                    Routing AI requests to the model provider
                                    configured for the hosted service.
                                </td>
                            </tr>
                            <tr>
                                <td className="text-foreground py-3 pr-4 align-top font-medium">
                                    OpenRouter
                                </td>
                                <td className="text-muted-foreground px-4 py-3">
                                    AI model access when configured for the
                                    hosted service.
                                </td>
                            </tr>
                            <tr>
                                <td className="text-foreground py-3 pr-4 align-top font-medium">
                                    Configured AI model provider
                                </td>
                                <td className="text-muted-foreground px-4 py-3">
                                    Processes prompts and relevant saved content
                                    to generate requested AI output. The
                                    provider depends on the model selected for
                                    the hosted service; contact us for the
                                    current provider.
                                </td>
                            </tr>
                            <tr>
                                <td className="text-foreground py-3 pr-4 align-top font-medium">
                                    Tavily
                                </td>
                                <td className="text-muted-foreground px-4 py-3">
                                    Web search queries and results when the
                                    feature is enabled.
                                </td>
                            </tr>
                            <tr>
                                <td className="text-foreground py-3 pr-4 align-top font-medium">
                                    Arcjet
                                </td>
                                <td className="text-muted-foreground px-4 py-3">
                                    Request protection, rate limiting, and PII
                                    redaction when configured.
                                </td>
                            </tr>
                            <tr>
                                <td className="text-foreground py-3 pr-4 align-top font-medium">
                                    Resend or configured SMTP provider
                                </td>
                                <td className="text-muted-foreground px-4 py-3">
                                    Account and service email delivery,
                                    depending on the hosted configuration.
                                </td>
                            </tr>
                            <tr>
                                <td className="text-foreground py-3 pr-4 align-top font-medium">
                                    Hosting, database, cache, and workflow
                                    providers
                                </td>
                                <td className="text-muted-foreground px-4 py-3">
                                    Cloud infrastructure and data storage. The
                                    active provider names and regions are
                                    deployment-specific and available on
                                    request.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="flex flex-col gap-4">
                <h2
                    className="text-foreground text-xl font-semibold tracking-tight"
                    id="exhibit-c"
                >
                    Exhibit C: Technical and Organizational Security Measures
                </h2>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                        <thead>
                            <tr className="border-border border-b">
                                <th className="text-foreground py-2 pr-4 font-semibold">
                                    Security Measure
                                </th>
                                <th className="text-foreground py-2 pl-4 font-semibold">
                                    Implementation Details
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-border divide-y">
                            <tr>
                                <td className="text-foreground py-3 pr-4 align-top font-medium">
                                    Authentication and authorization
                                </td>
                                <td className="text-muted-foreground py-3 pl-4">
                                    The hosted application requires an
                                    authenticated session for account data and
                                    scopes application queries to the account
                                    that owns the data. Public collection links
                                    provide read-only access to the collection
                                    selected for sharing.
                                </td>
                            </tr>
                            <tr>
                                <td className="text-foreground py-3 pr-4 align-top font-medium">
                                    Account separation
                                </td>
                                <td className="text-muted-foreground py-3 pl-4">
                                    User-owned records are associated with an
                                    account identifier. Service operations check
                                    that identifier when they access or change
                                    account data.
                                </td>
                            </tr>
                            <tr>
                                <td className="text-foreground py-3 pr-4 align-top font-medium">
                                    Connected account credentials
                                </td>
                                <td className="text-muted-foreground py-3 pl-4">
                                    The service stores OAuth credentials and
                                    uses them to carry out requests for the
                                    connected integration. Access to this data
                                    follows the account and service
                                    authorization controls.
                                </td>
                            </tr>
                            <tr>
                                <td className="text-foreground py-3 pr-4 align-top font-medium">
                                    Request protection
                                </td>
                                <td className="text-muted-foreground py-3 pl-4">
                                    Authenticated actions validate the user
                                    context. Rate limiting and sensitive data
                                    redaction are provided by Arcjet when that
                                    service is configured.
                                </td>
                            </tr>
                            <tr>
                                <td className="text-foreground py-3 pr-4 align-top font-medium">
                                    Infrastructure controls
                                </td>
                                <td className="text-muted-foreground py-3 pl-4">
                                    Transport encryption, encryption at rest,
                                    backups, infrastructure access, and
                                    retention depend on the active hosting and
                                    database providers. Provider will share
                                    available details for the hosted production
                                    configuration on written request.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>
        </article>
    );
}
