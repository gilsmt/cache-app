const UNTRUSTED_DATA_TAG = "untrusted-data";

/**
 * Renders reference data in the envelope that marks it as data rather than
 * instructions. Everything inside comes from saved pages, user content, or
 * another system, so `<` is escaped across the whole body: no value and no
 * description can close the envelope early.
 */
export function renderUntrustedData(args: {
    description: string;
    value: Record<string, unknown>;
}): string {
    const body = [args.description, JSON.stringify(args.value)].join("\n\n");

    return [
        `<${UNTRUSTED_DATA_TAG}>`,
        body.replaceAll("<", "\\u003c"),
        `</${UNTRUSTED_DATA_TAG}>`,
    ].join("\n");
}
