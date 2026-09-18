[README.md](README.md) for project overview.

Cache has a zero technical debt policy. Do it right the first time: the design that lands in the codebase should be the correct one, with no intentional debt in that surface. A problem solved in design costs less than one solved in implementation, which costs less than one solved in production. "Right the first time" describes the landed output, not the exploration that produced it — see simplicity below.

When rules conflict, prefer in order: correctness and safety of the change surface, then local coherence in files you already touch, then YAGNI, then style. If a tradeoff is required, choose correctness and robustness over short-term convenience or shortcuts.

Remove all mannered prose.

Leave the codebase better than you found it. Do not preserve complexity just because it already exists. Do not introduce machinery because it looks architecturally impressive. Understand the real constraint, then fight for the smallest model that makes the correct behavior unsurprising.

Suggest solutions or alternatives I didn’t think about and anticipate my needs. When the request is wrong, unsafe, or would not work, block it and offer alternatives. When it is merely suboptimal, challenge once with a concrete alternative, then execute the user's choice unless a hard constraint still fails. Reframe from first principles when that reaches a better answer.

Study and plan before implementing. Identify recurring patterns and design influences in the code. Keep rules or constraints of the task in mind.

Trace how parts connect, such as data flow between functions, stage dependencies, or what module owns what.

Read the full implementation of what you change and its direct callers/callees, not just the signatures, and not the whole repo. Do not rely on search snippets for broad changes.

It is not about formatting or syntax. Linters handle that. It is about how to think, how to make decisions, and what to value when building software.

Simple and elegant systems are easier to design correctly, more efficient in execution, and more reliable. That simplicity requires hard work and discipline.

Simplicity is not the first attempt. It is the hardest revision. It takes thought, multiple passes, and the willingness to throw work away. The goal is to find the idea that solves multiple problems at once.

Follow the rationale that each function should have a single, named responsibility. Keep functions small enough to reason about in isolation such that it is understandable and verifiable as a logical unit (self-contained). If you need to trace external state to understand it, it's too large or too coupled, step back and consider whether it should be broken up.

Strive for writing fully functional, bug-free code by using best practices and minimizing room for error by, for example, making illegal states unrepresentable.

Prohibit over-encapsulation and over-abstraction of code.

Avoid unnecessary code indirection. Extract when the same reason to change applies in two or more modules and the name is obvious; similar code with different futures may stay duplicated. Extracting a className string into a constant just because it is used twice is not justified. Keep logic in one function unless composable or reusable. Do not extract single-use helpers preemptively; inline at the call site unless reused, hiding a genuinely complex boundary, or carrying a clear independent name that improves the caller.

Follow YAGNI. Prefer the smallest clear unit, not the fewest lines — one-liners only for pure expressions with no branching, I/O, or error paths.

Control flow: Reduce nesting. Avoid else statements. Prefer early returns.

Handle errors at the appropriate scopes. Never silently swallow exceptions. If you think an error cannot happen, assert that assumption explicitly.

Never compromise type safety: avoid `any`, `!` (non-null assertion), and `as Type` casting as they usually indicate wrong assumptions or bad implementation. A cast is allowed only at a trust boundary (SDK, ORM, framework) when the invariant is runtime-checked or guaranteed by a typed wrapper one layer in. Prefer narrowing (`zod`, predicates, exhaustiveness). If you need a cast deeper than the boundary, fix the model. Validate unknown values once at the boundary that owns them. Pass typed values inward instead of repeating `typeof value === "object"` and property-existence checks. Do not defensively revalidate values already guaranteed by a schema, constructor, or internal type.

Declare variables at the smallest possible scope. Minimize the number of variables in play at any point. This reduces the probability of using the wrong variable and makes code easier to reason about. Calculate or check variables close to where they are used. Do not introduce variables before they are needed or leave them around when they are not.

Plugin architectures allow for extensibility and isolation; most functionality should live in plugins, not the core, enabling parallel development and future-proofing. Apply a plugin boundary when pluggability is itself a current requirement (sync adapters, export formats, AI providers). YAGNI governs speculative features — do not extract a plugin boundary for a single implementation.

Minimize risk by anticipating what’s most likely to fail (platforms, language changes, hardware, people...) and insulating your system from those points of failure.

When a function has several validation branches or supporting details, make the main function read as the happy path and move supporting details into small helpers below it. Keep helpers close to the code they support, below the main export when that improves readability.

Great names capture what a thing is or does. Append qualifiers to names. Units, bounds, and modifiers come at the end. This groups related variables together and makes scanning easier.

Anchor design decisions on the user's primary task or focus, to make sure the user can complete those tasks easily, not overwhelmed by unrelated UI clutter or user flows. Our UI should help users complete their tasks, not hinder them.

Constants are module-level and UPPER_SNAKE_CASE: Physics constants, selectors, and thresholds are declared at the top of the file, never inside the component.

Inline single-use values when the expression is obvious in place. Keep a name when it encodes units, domain meaning, or a non-obvious intermediate — even if used once.

Before adding a new utility, check if a similar one exists in the `lib/common` directory or nearby module scope as utils. Keep the utility at the smallest scope that uses it: file-private, then `lib/{module}/utils.ts` for domain logic. Promote to `lib/common` only when two or more unrelated modules share the same reason to change under a domain-free name with no domain imports.

## React

Build React components following full `vercel-composition-patterns` and `vercel-react-best-practices` rules.

Every component should be co-located into a single file with its parts, and should use a common, composable interface, making them predictable.

Avoid duplicating logic where necessary: If two components can share logic (such as event handlers), define the logic/handlers in the parent and share it through a context to the child; use the existing context if it exists. Before building any new UI element, search for an existing one to reuse. The same goes for patterns, not just components: before building a new scene or view, read 2–3 comparable ones and model yours on those that follow these rules or best practices.

Loading, empty, and error are three different views. Never show an empty state during the loading state. Loading indicators (skeletons, spinners) and empty states are mutually exclusive — guard empty state checks with `isLoading` so the loading UI renders first, and the empty state only appears after if loading actually completes with zero results.

Make sure every component file follows the same definition order: one shared module block (steps 2–5) at the top, then the exported components in original order (each with its props interfaces above), then the private sub-components at the bottom.

1. Imports
2. Module-level constants (UPPER_SNAKE_CASE)
3. Module-level types/interfaces that are not component props or state (e.g., TouchScrollState)
4. Module-level stateless objects (e.g., stateAttributesMapping, contexts from `React.createContext`)
5. Module-level pure helper functions: all hooks (`use*`) — each followed directly by its exclusive utilities — plus all other helpers, shared or component-private; context-reader hooks sit immediately after their `createContext`
6. Component prop/state interfaces, directly above their component. Only interfaces named `*Props`/`*State` that a JSX function references in its params qualify — hook state types like `TouchScrollState` stay in step 3
7. Component definitions (exported, PascalCase), in original file order
8. Private sub-components, at the bottom after the components, in original file order, each preceded by its props interface

Inside component functions, hooks and logic should be grouped in a predictable sequence.

## Naming Conventions

Boolean variables follow a prefix convention:

| Prefix | Example                                                | Context                      |
| ------ | ------------------------------------------------------ | ---------------------------- |
| is     | isVerticalScrollAxis, isNestedDrawerOpenRef            | State or derived condition   |
| has    | hasNestedDrawer, hasCrossAxisScrollableContent         | Possession                   |
| should | shouldUseAutoHeight, shouldApplySnapPoints, shouldDamp | Conditional behavior         |
| can    | canSwipeFromScrollEdgeOnMove, canStart                 | Capability / permission      |
| allow  | allowSwipe, allowTouchMove                             | Permission in touch handling |

Refs should be suffixed with `Ref` (e.g. `popupHeightRef`, `lastPointerTypeRef`)

Naming should match what the code actually does and follow sibling file/function names.

## Comments

Use mostly ASD-STE100 Simplified Technical English. Use active voice, simple tenses, one idea per sentence, and consistent terms. Explain why, not what, and only when a future reader (with no access to this PR or chat) would otherwise be confused. If appropriate, prefer no comments at all.

Never log change history or chat context in code — no "previously did X, now does Y", "per <task/PR>", "changed because…", or "AI:"/"agent:" notes. That goes in the commit message and PR description.

When refactoring or moving code, preserve existing comments unless they are explicitly made obsolete by the change.

## Tech stack

Runtime & Package Manager: Node.js 24.x and Bun (API docs is in `node_modules/bun-types/docs/**.mdx` if necessary)
Framework: Next.js 16 (App Router)
UI: [React 19](https://react.dev/llms.txt), Base-UI ([@base-ui/react](https://base-ui.com/llms.txt), @base-ui/utils), [motion (previously framer motion)](https://motion.dev/llms.txt), and lucide-react icons
React Compiler: enabled via Next.js `reactCompiler: true`. It automatically memoizes components and values, such as render-time derived values. Do not add manual `useMemo` or `useCallback`; they can interfere with compiler optimization
Styling: Tailwind CSS 4
Rich Text: [Lexical](https://lexical.dev)
Internationalization: [gt-next](https://generaltranslation.com/llms.txt)
Validation: [Zod v4.5](https://zod.dev/llms.txt) schemas
Database: PostgreSQL via [Prisma ORM v7](https://www.prisma.io/docs/llms.txt)
AI: [Vercel AI SDK](https://ai-sdk.dev/llms.txt) + [Workflow SDK](https://workflow-sdk.dev/llms.txt) for durable AI orchestration
Auth: [better-auth](https://better-auth.com/llms.txt) with @better-auth/stripe
Email: [Resend](https://resend.com/llms.txt)
Security: [Arcjet](https://arcjet.com/llms.txt) for rate limiting and PII redaction
Tooling: TypeScript v7 (strict typing), Biome via Ultracite (via `bun lint` or `bun lint:fix` for writing)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Server actions / Service module pattern

We organize and co-locate Next.js Server Actions as thin adapters in `lib/{module}/actions.ts` files that handle input/output validation, auth/session and privilege checks, error normalization, caching/revalidation and rate limiting. These actions call pure service functions which contain all business logic and database/external-API calls. Services never depend on the framework; they operate on validated data and return domain objects/typed results, and can be used independently either for other modules, as side effects, or pure server components.

Actions are the only networking boundary: they parse/validate inputs, guard with user context, translate service results to serialized responses, and decide application-specific side effects, like `revalidatePath()`. Behind the scenes, actions use the `POST` method. On the client, an action is consumed in one of two ways: as a read, by wrapping it in a small fetcher function passed to [swr](https://swr.vercel.app/llms.txt) (SWR calls the function locally); or as a mutation, by calling it directly from an event handler or form action. Either way the action is imported and invoked as an ordinary async function — the type signature of the export is the type of the call site, so requests and responses are fully inferred without an intermediate schema. Actions should return the minimal stable contract the current consumer needs — prefer a small DTO over entire domain objects or field-by-field thrash.

## Logging and error handling pattern

Instrument critical paths. Log errors with context. Emit metrics for failure rates. Trace requests across service boundaries.

Logging lives at `lib/common/logs/console/logger.ts`:
`createLogger(module)` returns a scoped logger with `.debug/.info/.warn/.error` and a `.time()` helper for spans.

Named error module lives at `lib/common/error.ts`:
`NamedError.create("SomeDomainError", z.object({...}))` creates a typed error class with runtime-validated `data` and a stable `name`.

Use these in services and actions to propagate domain failures with structured metadata (e.g., `{ operation, message, ... }`).

## Data model

The data model and schemas can be found at `prisma/schema.prisma`

## Git safety

Never discard or hide user work with a git command. `git restore`, `git checkout --`, `git reset`, `git clean`, and `git stash` (including `drop` and `clear`) destroy or hide staged and worktree changes. Stashed work leaves the normal status and diff flow and gets forgotten. Use them only when the user explicitly asks to discard to HEAD, and then ask for the deny to be lifted first.

Before any git write, inspect `git status --short`, `git diff`, and `git diff --cached` for the named paths. Touch only those paths. Keep edits in the worktree. Do not change the index (`--staged`) unless the user explicitly asks. Do not modify or revert changes you didn't author.

If rebase conflicts occur: Resolve conflicts only in files you modified. If a conflict is in a file you did not modify, abort and ask the user.

Never force push.

## Branch Names

Use a short branch name of at most three words, separated by hyphens. Do not use slashes or type prefixes such as `feat/` or `fix/`.

Examples: `session-recovery`, `fix-scroll-state`, `regenerate-sdk`.

## User Override

If the user's instructions conflict with any rule in this document, ask for explicit confirmation before overriding. Only then execute their instructions.

<!-- polylane:start -->
## Investigating production with Polylane

[Polylane](https://polylane.com/?ref=github.onboarding-pr) is an AI production engineer: it watches deploys, telemetry, incidents, and the infrastructure this repository ships to, investigates problems as they happen, and proposes fixes as pull requests. It is connected to this repository and available to coding agents through the [Polylane MCP server](https://mcp.polylane.com/mcp).

- When a question involves production behaviour (an error, a spike, a deploy, a missing signal), query Polylane through its MCP tools before reasoning from the code alone.
- When debugging a failure, start from the incident or issue Polylane recorded: it carries the evidence an investigation already gathered.
- Polylane reviews pull requests in this repository against the live infrastructure. Read its review comment before merging changes that touch production paths.
<!-- polylane:end -->
