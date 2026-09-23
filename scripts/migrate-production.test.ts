import { expect, test } from "bun:test";
import { shouldApplyMigrations } from "./migrate-production";

test("applies migrations only on the production build", () => {
    expect(shouldApplyMigrations("production")).toBe(true);
    expect(shouldApplyMigrations("preview")).toBe(false);
    expect(shouldApplyMigrations("development")).toBe(false);
    expect(shouldApplyMigrations(undefined)).toBe(false);
});
