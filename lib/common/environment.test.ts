import { describe, expect, test } from "bun:test";
import { isProductionDeployment } from "@/lib/common/environment";

describe("isProductionDeployment", () => {
    test("allows the production deployment", () => {
        expect(isProductionDeployment("production")).toBe(true);
    });

    test("allows a self-hosted deployment with no platform target", () => {
        expect(isProductionDeployment(undefined)).toBe(true);
    });

    test("refuses preview deployments", () => {
        expect(isProductionDeployment("preview")).toBe(false);
    });

    test("refuses development deployments", () => {
        expect(isProductionDeployment("development")).toBe(false);
    });
});
