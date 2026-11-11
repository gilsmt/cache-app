import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import * as z from "zod";
import { TaggedError } from "@/lib/common/error";

type EncryptionOperation = "encrypt" | "decrypt";

/** One shared message for every decrypt failure: distinguishing "malformed"
 * from "wrong key" hands an oracle to callers or adversaries. */
export const EncryptionError = TaggedError.create(
    "EncryptionError",
    z.object({
        message: z.string(),
        operation: z.enum(["encrypt", "decrypt"]),
    })
);
export type EncryptionError = InstanceType<typeof EncryptionError>;

/** Returns a self-contained `iv:ciphertext:authTag` string (hex). */
export function encrypt(
    plaintext: string,
    key: Buffer
): { encrypted: string; iv: string } {
    assertKey(key, "encrypt");

    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-gcm", key, iv, {
        authTagLength: 16,
    });
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();
    const ivHex = iv.toString("hex");

    return {
        encrypted: `${ivHex}:${encrypted}:${authTag.toString("hex")}`,
        iv: ivHex,
    };
}

/** Reverses {@link encrypt}; every failure (format, tamper, wrong key) is an EncryptionError. */
export function decrypt(
    encryptedValue: string,
    key: Buffer
): { decrypted: string } {
    assertKey(key, "decrypt");

    const parts = encryptedValue.split(":");
    const [ivHex] = parts;
    const authTagHex = parts.at(-1);
    const encrypted = parts.slice(1, -1).join(":");

    if (parts.length < 3 || ivHex === undefined || authTagHex === undefined) {
        throw new EncryptionError({
            message: "Decryption failed",
            operation: "decrypt",
        });
    }

    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    try {
        const decipher = createDecipheriv("aes-256-gcm", key, iv, {
            authTagLength: 16,
        });
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, "hex", "utf8");
        decrypted += decipher.final("utf8");

        return { decrypted };
    } catch (cause) {
        throw new EncryptionError(
            {
                message: "Decryption failed",
                operation: "decrypt",
            },
            { cause }
        );
    }
}

function assertKey(key: Buffer, operation: EncryptionOperation): void {
    if (key.length !== 32) {
        throw new EncryptionError({
            message: "Encryption key must be 32 bytes (256 bits)",
            operation,
        });
    }
}
