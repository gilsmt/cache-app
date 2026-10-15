/**
 * Maps the domain filters a model asks for onto the domains the visible
 * context exposes. The model writes domains in any casing and can invent
 * domains, so matching is case-insensitive and unmatched entries drop.
 */
export function matchAvailableDomains(
    requestedDomains: string[],
    availableDomains: Array<{ domain: string }>
): string[] {
    const domainsByLowerCase = new Map(
        availableDomains.map((entry) => [
            entry.domain.toLowerCase(),
            entry.domain,
        ])
    );
    const matchedDomains: string[] = [];
    for (const requestedDomain of requestedDomains) {
        const domain = domainsByLowerCase.get(requestedDomain.toLowerCase());
        if (domain !== undefined) {
            matchedDomains.push(domain);
        }
    }
    return matchedDomains;
}
