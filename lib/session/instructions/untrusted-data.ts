const UNTRUSTED_DATA_TAG = "untrusted-data";

/**
 * Renders reference data in the envelope that marks it as data rather than
 * instructions. The values come from saved pages and other systems, so `<` is
 * escaped to keep a value from closing the envelope early.
 */
export function renderUntrustedData(args: {
    description: string;
    value: unknown;
}): string {
    return [
        `<${UNTRUSTED_DATA_TAG}>`,
        args.description,
        "",
        JSON.stringify(args.value).replaceAll("<", "\\u003c"),
        `</${UNTRUSTED_DATA_TAG}>`,
    ].join("\n");
}
