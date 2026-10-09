import { describe, expect, test } from "bun:test";
import { listAvailableIntegrations } from "@/lib/integrations/registry";

function availableIds(configuredProviderIds: string[]): string[] {
    return listAvailableIntegrations(configuredProviderIds).map(
        (integration) => integration.id
    );
}

describe("listAvailableIntegrations", () => {
    test("excludes an integration whose OAuth provider is not configured", () => {
        const ids = availableIds(["google"]);

        expect(ids).not.toContain("x");
        expect(ids).not.toContain("reddit");
    });

    test("includes an integration once its OAuth provider is configured", () => {
        const ids = availableIds(["google", "x", "reddit"]);

        expect(ids).toContain("x");
        expect(ids).toContain("reddit");
    });

    test("keeps integrations that need no OAuth provider", () => {
        const ids = availableIds([]);

        expect(ids).toContain("chrome");
        expect(ids).toContain("markdown");
        expect(ids).toContain("mcp");
        expect(ids).toContain("rss");
    });

    test("keeps the Google Photos integration on the configured google provider", () => {
        const ids = availableIds(["google"]);

        expect(ids).toContain("google-photos");
    });
});
