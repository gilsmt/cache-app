import { createNextMiddleware } from "gt-next/middleware";

export default createNextMiddleware();

export const config = {
    matcher: [
        "/((?!api/|mcp(?:/|$)|static/|_next/|_vercel/|\\.well-known/workflow/|[^/]+\\.[^/]+$).*)",
    ],
};
