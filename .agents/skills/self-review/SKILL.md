---
name: self-review
description: >-
    Final self-review of your own completed work before wrapping up or committing
    when the change is substantial or non-trivial. For genuinely small,
    low-risk, self-contained changes, use judgment and skip the full review when
    it would not add meaningful confidence. Use ONLY after you have finished
    implementing and are about to stop — never at the start of a task, never
    mid-implementation, and never to plan upcoming work. Triggers:
    "self-review", "review your work", "before we commit", "wrap up", or when
    you are done coding and ready to hand off.
---

<!-- Based on https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md -->

You just finished some work. Before committing, step back and review it with a critical eye.

The goal is NOT to rubber-stamp what you did. The goal is to catch the shortcuts, the entropy, the "good enough" choices that erode a codebase over time. Every quick fix has a cost in maintainability. Fight that.

## Process

1. **Gather all changes.** Run `git status` to see the full picture. Then run `git diff --cached` for all recently made staged changes. If the code you modified isn't staged, then stage it. Read every changed file fully — not just the diff hunks, but the surrounding context.

2. **Spawn a bug-finding subagent.** Launch a `general` subagent that calls the `find-bugs-diff` skill to review your changes for bugs, security vulnerabilities, regressions, and code quality issues. Do NOT call the `find-bugs-diff` skill yourself — delegate it entirely to the subagent. Do not wait yet — continue with steps 3–5 while it runs.

3. **Identify and re-check the goal.** Compare the diff against the originating source goal or spec that was passed to you (user request, issue, path, PRD, plan). Flag anything missing, partial, wrong, or out of scope.

4. **Read the quality standards.** Read these docs and review the work against each point:
    - `AGENTS.md`

5. **Smell baseline (Fowler).** On top of the repo standards, walk the diff against this fixed set of code smells from Fowler's _Refactoring_ (ch.3). Two rules bind it:

    - **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
    - **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation — and skip anything tooling already enforces.

    Each smell reads _what it is_ → _how to fix_; match it against the diff:

    - **Mysterious Name** — a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
    - **Duplicated Code** — the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
    - **Feature Envy** — a method that reaches into another object's data more than its own. → move the method onto the data it envies.
    - **Data Clumps** — the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
    - **Primitive Obsession** — a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
    - **Repeated Switches** — the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
    - **Shotgun Surgery** — one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
    - **Divergent Change** — one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
    - **Speculative Generality** — abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
    - **Message Chains** — long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
    - **Middle Man** — a class or function that mostly just delegates onward. → cut it, call the real target direct.
    - **Refused Bequest** — a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

6. **Await the bug report (Step 2.) and consolidate.** Collect findings from the subagent plus steps 3–5 into one list. Do not start fixing until this list is complete.

7. **Fix violations.** Fix in severity order: goal gaps → bugs/security → standards → smells. Don't just report — fix. If a fix would be too large or risky, flag it explicitly with what's wrong and why you're not fixing it now. If a fix rewrites structure (not just renames or guards), re-run steps 5 and 2 on the post-fix diff before continuing.

8. **Fight entropy.** Look at the code you touched and the code around it. Did you leave it better than you found it? Did you introduce complexity that isn't justified? Did you take a shortcut that a future reader will curse? If something nearby is already broken or messy and your change made it worse or left it as-is when a small improvement was obvious, fix it.

9. **Look for refactoring opportunities.** Actively ask yourself: what can be refactored in or around the code you touched to make it easier to maintain long term? Duplicated logic that should be extracted and reused, unclear abstractions that should be simplified, tangled responsibilities that should be separated. Don't just preserve the status quo — improve it.
    - **Runtime errors**: Potential exceptions, null pointer issues, out-of-bounds access
    - **Performance**: Unbounded O(n²) operations, N+1 queries, unnecessary allocations
    - **Side effects**: Unintended behavioral changes affecting other components
    - **Backwards compatibility**: Breaking API changes without migration path
    - **ORM queries**: Complex Django ORM with unexpected query performance
    - **Security vulnerabilities**: Injection, XSS, access control gaps, secrets exposure

10. **Report.** After fixing everything, give a brief summary of what you changed and what you flagged.

**Do NOT stage the post-review fixes.** Leave them unstaged so the reviewer can inspect the fix diff separately from the original work. Staging them buries the fixes inside the original commit.

## The final question

Before you're done, ask yourself the three questions from the quality guide:

1. Did you do the hard thing, or take a shortcut that creates debt?
2. Would you be confident if this code ran at 10x the current load?
3. Will someone reading this in six months understand why it works this way?

If any answer is no, go back and fix it.
