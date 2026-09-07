import { BASE_URL } from "@/lib/common/constants";

export function GET() {
    const expiresDate = new Date();
    expiresDate.setFullYear(expiresDate.getFullYear() + 1);
    const expires = expiresDate.toISOString();

    const securityTxt = `# Security Policy for Cache
# https://securitytxt.org/
# RFC 9116: https://www.rfc-editor.org/rfc/rfc9116.html

# Required: Contact information for security reports
Contact: mailto:notices@cachd.app

# Required: When this file expires (ISO 8601 format, within 1 year)
Expires: ${expires}

# Preferred languages for security reports
Preferred-Languages: en

# Canonical URL for this security.txt file
Canonical: ${BASE_URL}/.well-known/security.txt

# Link to security policy page
Policy: ${BASE_URL}/security

# If you discover a security vulnerability, please report it responsibly.
# We appreciate your help in keeping Cache and our users secure.
`;

    return new Response(securityTxt, {
        headers: {
            "Cache-Control": "public, max-age=86400",
            "Content-Type": "text/plain; charset=utf-8",
        },
    });
}
