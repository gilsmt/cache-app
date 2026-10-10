import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
    mintExtensionIngestToken,
    verifyExtensionIngestToken,
} from "@/lib/integrations/extension-ingest/auth";

const SECRET = "test-extension-ingest-secret";

/** 48 characters of nanoid: the shape `user.extensionIngestToken` used to hold. */
const LEGACY_CLEARTEXT_TOKEN =
    "V1StGXR8_Z5jdHi6B-myTq3n4xPfLoK9sDcEiUaQbNk2mA0EzW";

interface UserCutoff {
    ingestTokenMinIssuedAt: Date | null;
}

interface TokenRotationUpdate {
    data: { ingestTokenMinIssuedAt: Date };
    where: { id: string };
}

let storedCutoff: Date | null = null;

const findUnique = mock(
    async (): Promise<UserCutoff | null> => ({
        ingestTokenMinIssuedAt: storedCutoff,
    })
);
const update = mock((args: TokenRotationUpdate) => {
    storedCutoff = args.data.ingestTokenMinIssuedAt;
    return {};
});

mock.module("server-only", () => ({}));
mock.module("@/lib/integrations/import", () => ({
    upsertLibraryItemImports: mock(async () => ({})),
}));
mock.module("@/prisma", () => ({ prisma: { user: { findUnique, update } } }));

const { resolveExtensionIngestUserId, rotateExtensionIngestToken } =
    await import("@/lib/integrations/extension-ingest/service");

function resetFixture(): void {
    process.env.BETTER_AUTH_SECRET = SECRET;
    delete process.env.INSTAGRAM_SAVED_INGEST_TOKEN;
    delete process.env.EXTENSION_FALLBACK_USER_ID;
    storedCutoff = null;
    findUnique.mockClear();
    update.mockClear();
}

describe("resolveExtensionIngestUserId", () => {
    beforeEach(resetFixture);

    test("resolves a minted token to its user", async () => {
        const token = mintExtensionIngestToken("user_1");

        await expect(resolveExtensionIngestUserId(token)).resolves.toBe(
            "user_1"
        );
        expect(findUnique).toHaveBeenCalledWith({
            select: { ingestTokenMinIssuedAt: true },
            where: { id: "user_1" },
        });
    });

    test("rejects the cleartext token without looking it up in the table", async () => {
        await expect(
            resolveExtensionIngestUserId(LEGACY_CLEARTEXT_TOKEN)
        ).resolves.toBeNull();
        expect(findUnique).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });

    test("rejects a token minted before the user's cut-off", async () => {
        const token = mintExtensionIngestToken("user_1");
        const claims = verifyExtensionIngestToken(token);
        if (!claims) {
            throw new Error("the minted token did not verify");
        }
        storedCutoff = new Date(claims.issuedAt + 1);

        await expect(resolveExtensionIngestUserId(token)).resolves.toBeNull();
    });

    test("rejects a token whose user no longer exists", async () => {
        findUnique.mockResolvedValueOnce(null);

        await expect(
            resolveExtensionIngestUserId(mintExtensionIngestToken("user_1"))
        ).resolves.toBeNull();
    });
});

describe("rotateExtensionIngestToken", () => {
    beforeEach(resetFixture);

    test("cuts earlier tokens and returns a replacement the cut-off keeps", async () => {
        const replacement = await rotateExtensionIngestToken({
            userId: "user_1",
        });

        expect(update).toHaveBeenCalledWith({
            data: { ingestTokenMinIssuedAt: expect.any(Date) },
            where: { id: "user_1" },
        });
        await expect(resolveExtensionIngestUserId(replacement)).resolves.toBe(
            "user_1"
        );
    });
});
