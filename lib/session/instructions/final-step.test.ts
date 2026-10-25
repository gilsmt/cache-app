import { describe, expect, test } from "bun:test";
import { getFinalStepSystem } from "./final-step";

const INSTRUCTIONS = "base policy";
const EXHAUSTED = "Tool budget exhausted";

describe("getFinalStepSystem", () => {
    test("keeps the base prompt on every step before the last", () => {
        expect(
            getFinalStepSystem({
                instructions: INSTRUCTIONS,
                maxSteps: 6,
                stepNumber: 4,
            })
        ).toBeUndefined();
    });

    test("appends the notice to the base prompt on the last step", () => {
        const system = getFinalStepSystem({
            instructions: INSTRUCTIONS,
            maxSteps: 6,
            stepNumber: 5,
        });

        expect(system?.startsWith(`${INSTRUCTIONS}\n\n`)).toBe(true);
        expect(system).toContain(EXHAUSTED);
    });

    test("treats the only step of a single-step run as the last step", () => {
        expect(
            getFinalStepSystem({
                instructions: INSTRUCTIONS,
                maxSteps: 1,
                stepNumber: 0,
            })
        ).toContain(EXHAUSTED);
    });

    test("does not extend the notice past the last step", () => {
        expect(
            getFinalStepSystem({
                instructions: INSTRUCTIONS,
                maxSteps: 6,
                stepNumber: 6,
            })
        ).toBeUndefined();
    });
});
