import { describe, expect, test } from "bun:test";
import type { LibraryItemWithCollections } from "@/lib/collections/utils";
import { buildItemsCsv } from "@/lib/collections/utils";
import { LibraryItemSource } from "@/prisma/client/enums";

function makeItem(
    overrides: Partial<LibraryItemWithCollections> = {}
): LibraryItemWithCollections {
    const defaults: LibraryItemWithCollections = {
        browserProfileId: "default",
        caption: null,
        collections: [],
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        deletedAt: null,
        externalId: "1",
        favoritedAt: null,
        id: "item-1",
        kind: "bookmark",
        linkCheckedAt: null,
        linkReachability: null,
        noteContentHtml: null,
        noteContentState: null,
        noteContentText: null,
        parentExternalId: null,
        postedAt: null,
        reviewedAt: null,
        scrapedAt: null,
        smartCollectedAt: null,
        source: LibraryItemSource.other,
        sourceAliasIds: [],
        sourceDeviceId: null,
        sourceDeviceName: null,
        sourceMetadata: null,
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        url: "https://www.example.com",
        userId: "user-1",
    };
    return Object.assign(defaults, overrides);
}

const SPREADSHEET_FORMULA_PREFIXES = ["=", "+", "-", "@"] as const;

describe("buildItemsCsv", () => {
    test("prefixes captions starting with spreadsheet formula characters", () => {
        for (const prefix of SPREADSHEET_FORMULA_PREFIXES) {
            const csv = buildItemsCsv(
                "Collection",
                "name",
                [makeItem({ caption: `${prefix}1+1` })],
                "\n"
            );
            const captionCell = csv.split("\n")[1]?.split(",")[1];

            expect(captionCell).toBe(`"'${prefix}1+1"`);
        }
    });

    test("prefixes captions with leading whitespace before a formula character", () => {
        const csv = buildItemsCsv(
            "Collection",
            "name",
            [makeItem({ caption: " =1+1" })],
            "\n"
        );
        const captionCell = csv.split("\n")[1]?.split(",")[1];

        expect(captionCell).toBe(`"' =1+1"`);
    });

    test("prefixes spreadsheet-sensitive header and label cells", () => {
        const csv = buildItemsCsv(
            "=Header",
            "@label",
            [makeItem({ caption: "plain caption" })],
            "\n"
        );
        const rows = csv.split("\n");

        expect(rows[0]).toBe(
            `"'=Header","Caption","URL","Source","Kind","Saved At","Posted At"`
        );
        expect(rows[1]).toBe(
            `"'@label","plain caption","https://www.example.com/","other","bookmark","2026-01-01T00:00:00.000Z",""`
        );
    });
});
