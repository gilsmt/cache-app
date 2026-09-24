import { BASE_URL } from "@/lib/common/constants";

export function GET() {
    const expiresDate = new Date();
    expiresDate.setFullYear(expiresDate.getFullYear() + 1);
    const expires = expiresDate.toISOString();

    const securityTxt = `# Security Policy for Cache
# https://securitytxt.org/
# RFC 9116: https://www.rfc-editor.org/rfc/rfc9116.html

# If you discover a security vulnerability, please report it privately by email
Contact: mailto:notices@cachd.app

# When this file expires (ISO 8601 format, within 1 year)
Expires: ${expires}

# Security policy
Policy: ${BASE_URL}/security

# General (non-security) issues
Contact: https://github.com/gilsmt/cache-app/issues/new?assignees=&labels=bug

Preferred-Languages: en
Canonical: ${BASE_URL}/.well-known/security.txt
`;

    return new Response(securityTxt, {
        headers: {
            "Cache-Control": "public, max-age=86400",
            "Content-Type": "text/plain; charset=utf-8",
        },
    });
}
