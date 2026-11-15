/**
 * Appended to the system prompt on the last step of a run. The loop stops after
 * it, so the model answers from what it already has instead of promising work
 * it cannot do.
 */
const FINAL_STEP_NOTICE = [
    "Tool budget exhausted: this is the last step of the run, and no tools are available.",
    "Answer with the information you already have. Do not promise follow-up actions or ask the user to continue.",
].join("\n");

/**
 * The system prompt for the last step of a run, or undefined on every earlier
 * step. Every agent loop reads its step budget from here so they all end the
 * same way.
 */
export function getFinalStepSystem(args: {
    instructions: string;
    maxSteps: number;
    stepNumber: number;
}): string | undefined {
    if (args.stepNumber !== args.maxSteps - 1) {
        return undefined;
    }
    return `${args.instructions}\n\n${FINAL_STEP_NOTICE}`;
}
