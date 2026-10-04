---
name: reliable-systems
description: How to think about reliable systems in domain models. Use when designing state management, type systems, domain boundaries, error handling, or service contracts. Triggers on discussions of React state, backend data flow, database design, making illegal states unrepresentable, deriving values instead of storing them, preventing bugs through types, diagnosing why a retry or timeout or threshold change did not fix a production problem, or diagnosing oscillation, runaway growth, and cascading failure.
---

# How to think about reliability

A system operates reliably because it can absorb variation: it degrades gracefully, its operators can understand and adjust it, and the architecture makes the right thing easy and the wrong thing difficult. Reliability is not just the absence of failure. It is the presence of adaptive capacity. It is a system's ability to keep functioning while reality continues its longstanding and regrettable habit of refusing to hold still.

Specially, reliability across many teams (or agents), many of whom represent this adaptive capacity, means minimizing as much as possible without compromise the cognitive load by making it a daily concern.

So the questions we ask are operational. Can the new hire on your team read this module and understand what it does? If the database is slow, does this service degrade or does it fall over and take its neighbors with it? If someone misuses an interface, does the compiler tell them, or do we find out when the on-call gets paged? If you don't have answers to those questions, you have a future incident quietly unfolding.

One way of doing that is through purity. In production, the goal is often not to avoid mutation entirely, because that is not a serious proposition for most real systems. The goal is to contain mutation, make the containment legible, and verify that it stays contained. Often the right question is not "is this pure?" but "where is the impurity, and how much of the codebase is allowed to know about it?"

Purity is a boundary you try to maintain. This boundary-oriented view of purity sets up a more general pattern that recurs throughout production engineering: dangerous things are tolerable when they are fenced in, carefully exposed, and hard to misuse. That is true of mutation. It is true of retries, transactions, state machines, distributed workflows, and type-level machinery. Much of what follows is really just this same idea, wearing different hats, down to call stacks, self-contained modules, or dependency trees.

## 1. Minimize State, Derive Values

If a value can be computed from existing data, do not store it. Derive it on demand. Every piece of state is a liability: it can desynchronize, it demands updates, and it expands the surface area a reader must hold in their head.

**Bad (dual state, manual sync):**

```typescript
let count = 0
let doubled = 0
function setCount(value: number) {
  count = value
  doubled = value * 2
}
```

**Good (single source of truth):**

```typescript
let count = 0
const doubled = () => count * 2
```

This applies everywhere. In React, derive values inline during render instead of storing them in state:

```tsx
// Bad
const [count, setCount] = useState(0)
const [doubled, setDoubled] = useState(0)
useEffect(() => setDoubled(count * 2), [count])

// Good
const [count, setCount] = useState(0)
const doubled = count * 2
```

With React Compiler enabled (as in this project), manual `useMemo` is unnecessary—the compiler automatically memoizes derived values. Only precompute if profiling proves the derivation itself is a bottleneck.

On the backend, compute aggregates on demand rather than storing denormalized copies:

```typescript
// Bad: duplicate total in DB/state, risk of drift
await db.order.update({ data: { total: computedTotal } })

// Good: derive from line items, cache if needed
const total = lineItems.reduce((s, i) => s + i.amount, 0)
```

And in the database, prefer views or materialized views over duplicating data across tables:

```sql
-- Bad: total stored in orders, can drift from line_items
-- Good: view derives from source
CREATE VIEW order_totals AS
  SELECT order_id, SUM(amount) AS total
  FROM line_items
  GROUP BY order_id;
```

Use materialized views when read performance justifies refresh cost.

### Buffers are state you chose on purpose

Not every stored value is an accident. A queue, a connection pool, a retry chain, an in-flight request budget, and a cache are deliberate stocks: they buy stability in exchange for memory, latency, and staleness. The question is not whether they exist, but whether their size was chosen against the flow that will pass through them. See [Intervene on Structure, Not Parameters](#intervene-on-structure-not-parameters).

### Checklist for new state

Before adding state, ask:

- [ ] Can this be derived from props, existing state, or fetched data?
- [ ] If derived: is the computation cheap enough to run on render/request?
- [ ] If precomputation needed: is the performance gain measurable and worth the extra complexity?

Only when performance clearly requires precomputation should you store a derived value. Investigate every new piece of state—most are not needed.

## 2. Make the Right Thing Easy

There is a pattern in large codebases where correctness depends on performing operations in a particular order, or including a particular step that has no visible connection to the main work.

"Remember to flush the audit log after every transaction."

"Always check the feature flag before calling this endpoint."

"Make sure to enqueue the notification inside the database transaction, not after it."

These are the incantations of operational lore. They live in wiki pages, onboarding documents, half-forgotten design reviews, and the memories of senior engineers who are now three teams away and booked solid until Thursday. In a company that is hiring aggressively, the half-life of tribal knowledge is alarmingly short. When an engineer leaves, the incantations fade. When a deadline approaches, they are the first thing skipped. When a new engineer joins, they often have no way to know the incantation exists at all. Nothing says "robust system design" quite like a critical invariant living in a Slack thread from nine months ago.

The type system gives you the tools to encode these incantations in types so they cannot be forgotten.

Consider a simplified version of a real pattern: you need to ensure that certain side effects (sending a notification, publishing an event) happen transactionally with a database write. Not before, not after, and not in a separate transaction. Together, or not at all.

The naïve approach is to tell people to use the right function:

```hs
-- Please use this one, not the other one
writeWithEvents :: Transaction -> [Event] -> IO ()

-- Don't use this directly (but we can't stop you)
writeTransaction :: Transaction -> IO ()
publishEvents :: [Event] -> IO ()
```

This is rookie-level engineering. It works until it doesn't, and "until it doesn't" tends to arrive on a Friday afternoon when the person who wrote the wiki page is on vacation and everybody else is discovering, in real time, that the wiki page was load-bearing.

A better approach restructures the types so that the only way to commit work is through a path that includes event publication:

```hs
data Transact a -- opaque; cannot be run directly
record :: Transaction -> Transact ()
emit :: Event -> Transact ()

-- The *only* way to execute a Transact: commit and publish atomically
commit :: Transact a -> IO a
```

Now the incantation is the only door in the room. You cannot forget it because there is nothing else to do. The type system has not proven anything especially deep about your events. It has done something more practical: it has made the correct operational procedure the path of least resistance.

That distinction matters. In production, there are plenty of places where we do not need a theorem. We need a design that makes it difficult for an ordinary busy engineer to accidentally do the wrong thing while trying to do a dozen other perfectly reasonable things. The compiler is not merely checking logic here; it is preserving institutional memory and turning it into a hard-edged interface.

When a new engineer joins and asks "how do I write a transaction?", the type system answers them. When a senior engineer leaves, the answer remains. The institutional knowledge survived not because someone documented it beautifully, though documentation is pleasant when available, but because someone encoded it in a form the compiler enforces. The compiler is a better custodian of operational lore than the average wiki — provided the types themselves are maintained and not bypassed with casts or ignore directives, which can leave a codebase in a worse state than a neglected wiki page. It is a tool among many, not a replacement for thoughtful design reviews and clear written guidance.

Types are rules, and rules have a power structure. Every guardrail has a bypass path: a cast, an ignore directive, an env var, a permission someone can grant, a check someone can skip under deadline. The bypass is where the invariant actually dies, so make it loud, and watch the rate. A guardrail that gets routinely bypassed is not a discipline problem; it is telling you the invariant sits in the wrong place. Move it down into a type or a schema where the bypass does not exist.

## 3. Make Invalid States Unrepresentable

Types define representable states; business logic defines valid states; bugs arise in the gap between them. You can reduce bugs by shrinking the set of representable states rather than only handling more cases.

Designing types so representable states closely match valid states shifts many errors from runtime to compile time. Not all illegal states must be unrepresentable, but more thoughtful type design systematically prevents more bugs earlier.

### Use domain-specific types

Replace primitive types with domain-specific ones so invalid values cannot be constructed:

```typescript
// Bad: any string is a "color"
function setColor(hex: string) { ... }
setColor("not-a-color") // compiles, fails later

// Good: only valid colors are representable
enum Color {
  Red = "#ff0000",
  Green = "#00ff00",
  Blue = "#0000ff",
}
function setColor(color: Color) { ... }
```

### Encode constraints in data structures

Separate types so illegal combinations are untypeable and caught at compile time:

```typescript
// Bad: action can have edit fields even when it's not an edit
interface Action {
  type: "create" | "edit" | "delete";
  targetId?: string; // only meaningful for edit/delete
  payload?: unknown; // only meaningful for create/edit
}

// Good: each action shape is enforced by the type system
type Action =
  | { type: "create"; payload: unknown }
  | { type: "edit"; targetId: string; payload: unknown }
  | { type: "delete"; targetId: string };
```

### Model state machines in types

Use the type system to enforce valid state transitions and initial states:

```typescript
// Bad: one class with a mutable string state
type VpnStatus = "disconnected" | "connecting" | "connected";

// Good: each state is a distinct type; transitions are typed methods
class VpnDisconnected {
  connect(): VpnConnecting { return new VpnConnecting(); }
}

class VpnConnecting {
  private constructor() {}
  onConnected(): VpnConnected { return new VpnConnected(); }
  onTimeout(): VpnDisconnected { return new VpnDisconnected(); }
}

class VpnConnected {
  private constructor() {}
  disconnect(): VpnDisconnected { return new VpnDisconnected(); }
}
```

This pattern is especially powerful for long-lived workflows, connection lifecycles, and any domain where the operations available depend on the current state. The compiler becomes a proof that you cannot call `disconnect` on a disconnected VPN or `sendData` while still connecting.

## 4. Durable Execution

The pattern above—structuring types so that the correct operational procedure is the only procedure—works well within a single transaction. Many systems, unfortunately, have never felt obligated to remain inside a single transaction.

They are full of processes that span multiple steps, multiple services, and multiple failure modes. Send a payment, wait for a partner to acknowledge it, update the ledger, notify the customer, handle cancellation, handle timeout, handle the case where the partner said yes but your worker died before recording the answer, handle the case where the partner said nothing because the network briefly entered a higher plane of existence and declined to tell you about it. If any step fails, you need to know where you were, what has already happened, and what still needs to happen. You need state. You need retries. You need timeouts. You need idempotence. You need all of these things to keep working across process crashes and deployments. Very quickly, what began as "just some business logic" amasses a remarkable amount of one-off repeats of common operational concerns.

In practice, resist rebuilding these primitives ad-hoc. Use a durable execution framework, saga orchestration, or an event-sourced workflow engine (e.g., Temporal, Cadence) so that retries, state persistence, and failure handling are first-class rather than scattered across your service code.

Durable execution buys you the one thing that makes multi-step processes tractable: the ability to wait without holding a process. It does not buy immunity to mis-sized waits. Every timeout you write is a delay, and a delay only means something relative to how fast the thing it observes is moving. See [Intervene on Structure, Not Parameters](#intervene-on-structure-not-parameters).

## 5. Design for Your Domain, Not Your Transport

As your production system grows, a common mistake is letting the invoking system leak into the domain model.

We have code that throws HTTP status code exceptions which return those results directly to the user on the frontend. This made sense when the code was written, because it ran in an HTTP request handler. Then, as happens in any growing codebase, pieces of that code got extracted and reused. Now it also runs in cron jobs. It runs in queued background workers. It runs in Temporal workflows. And it still throws StatusCodeException 409 "Conflict" when something goes wrong, which is an absolutely unhinged thing for a cron job to do. A cron job does not have a caller waiting for a 409. Nobody is reading that status code. The error has propagated through the system simply because the original abstraction was coupled to its transport layer.

The fix is conceptually simple: model your domain errors as domain types. A payment that fails because of insufficient funds should be an InsufficientFunds, not a 402. A duplicate request should be a DuplicateRequest, not a 409. These are things your business logic can match on, retry against, log meaningfully, and handle differently depending on context.

Then you write thin translation layers at each boundary:

```ts
// lib/payment/errors.ts
import * as z from "zod";
import { NamedError } from "@/lib/common/error";

// Domain errors are independent of any transport. They describe what went wrong
// in the business, not what status code a caller should receive.
export class InsufficientFunds extends NamedError.create(
  "InsufficientFunds",
  z.object({ requestedAmount: z.number(), availableBalance: z.number() })
) {}

export class DuplicateRequest extends NamedError.create(
  "DuplicateRequest",
  z.object({ requestId: z.string() })
) {}
```

```ts
// lib/payment/service.ts
// Pure service: knows nothing about HTTP, cron, or queues.
// It speaks in domain types and domain failures.
export async function processPayment(input: PaymentInput) {
  const account = await getAccount(input.accountId);

  if (account.balance < input.amount) {
    throw new InsufficientFunds({
      requestedAmount: input.amount,
      availableBalance: account.balance,
    });
  }

  const existing = await findRequest(input.requestId);
  if (existing) {
    throw new DuplicateRequest({ requestId: input.requestId });
  }

  // ... persist, publish events, etc.
}
```

```ts
// app/api/payments/route.ts
// Thin HTTP adapter: the *only* place HTTP concerns appear.
// It translates domain failures into the appropriate response for this boundary.
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const input = await request.json();

  try {
    const result = await processPayment(input);
    return NextResponse.json(result);
  } catch (error) {
    // Use serializable name checks instead of `instanceof` so error
    // identity survives bundling, serialization, and worker boundaries.
    if (error instanceof InsufficientFunds || error.name === "InsufficientFunds") {
      // 402 is meaningful here because this *is* an HTTP request.
      return NextResponse.json(
        { error: "InsufficientFunds", data: error.data },
        { status: 402 }
      );
    }

    if (error instanceof DuplicateRequest || error.name === "DuplicateRequest") {
      return NextResponse.json(
        { error: "DuplicateRequest", data: error.data },
        { status: 409 }
      );
    }

    throw error;
  }
}
```

```ts
// lib/payment/cron.ts
// The same service, invoked from a cron job. No status codes, no HTTP leakage.
// The cron job logs, retries, or alerts based on the domain error type.
export async function retryFailedPayments() {
  for (const job of await getPendingJobs()) {
    try {
      await processPayment(job.input);
    } catch (error) {
      // Use serializable name checks instead of `instanceof` so error
      // identity survives bundling, serialization, and worker boundaries.
      if (error instanceof InsufficientFunds || error.name === "InsufficientFunds") {
        // Business decision: skip and notify the user out-of-band.
        await notifyUser(job.userId, "payment_failed", error.data);
        continue;
      }

      if (error instanceof DuplicateRequest || error.name === "DuplicateRequest") {
        // Idempotency: safe to mark as done.
        await markComplete(job.id);
        continue;
      }

      // Unknown error: let the runner retry or page on-call.
      throw error;
    }
  }
}
```

The domain model stays clean because `InsufficientFunds` and `DuplicateRequest` mean the same thing regardless of where they originate. The HTTP route decides they map to 402 and 409; the cron job decides they map to a notification and a skip. The service does not know either decision exists. That separation is what prevents a cron job from throwing a `StatusCodeException` into the void.

This is the same principle as purity, expressed in domain language rather than operational language. Your transport concerns belong at the edges or the "seams". Your domain model should survive being invoked from a web handler, a CLI, a cron job, a background worker, or a workflow engine without having to drag an HTTP status code behind it like a tin can tied to a wedding car.

## The Type Encoding Tradeoff

We've been encouraging you to encode business rules into types. Here is the necessary counterweight: do not do too much of it.

Encoding invariants into types is powerful. It is also expensive. Not at runtime, but in cognitive overhead, in the rigidity it introduces, and in the difficulty of changing things later when the requirements shift. And the requirements will shift. If you work at a company where they do not, I would like to know your secret, and also your stock ticker.

Every invariant you push into the type system is a constraint on every future engineer who touches that code. If violating the constraint would cause data loss, financial errors, regulatory trouble, or a poor soul's pager to go off, then the cost is justified. If the constraint is "we currently happen to do things this way," or "I read this article about dependent types and I simply must apply that to my authorization logic," you have likely just made your codebase harder to change for no operational benefit. The next person to encounter it will either spend a week refactoring the types or, more likely, find a way around them that is worse than what you were trying to prevent.

There is a spectrum, and production codebases must live on it honestly.

At one end: you encode everything. Your types are a faithful model of your domain. Illegal states are unrepresentable. Refactoring takes weeks because changing a business rule means threading a type change through fifty modules. New engineers stare at the type signatures and wonder what they have done to deserve this, then quietly begin discussing their career options with a therapist. You have built a cathedral. Cathedrals are beautiful. They are also expensive, cold, and not especially famous for how quickly one renovates the plumbing.

At the other end: you encode nothing. Your types are String and IO () and, in the worst case, Dynamic. The code is easy to change because there are no contracts to violate. The system works because the people who built it are still around and remember what the strings mean. When they leave, it stops working, and nobody knows why. You have built a tent. Tents are flexible, portable, and, under certain weather conditions, a very direct way to learn about the sky.

The sweet spot is somewhere in the middle. A few heuristics I think are useful:

**Encode invariants that protect against silent corruption.** If a violation would produce wrong data without any immediate error (a transaction committed without its events, a payment processed without an audit log, a state transition that looks plausible but is semantically impossible), put it in the types. The feedback loop for silent failures is too long to rely on human diligence.

**Use runtime checks for invariants that fail loudly.** If a violation would produce an immediate, obvious error (a 500 response, a failed assertion, a type mismatch at a JSON boundary), a runtime check with a good error message may be enough. You will catch it before production, or very quickly after.

**Resist the urge to model your entire domain in types.** Your domain is messy. It has edge cases, grandfather clauses, rules that contradict each other, and special behavior for three specific customers that dates back to 2018 and that nobody fully understands. The type system wants crispness. Your business does not provide it. Nor will it ever.

**Remember that types are for the team, not just for the compiler.** The compiler is one tool among many. Tests, documentation, code review, examples, playbooks: these all combine to provide defense in depth. The goal is not to win an argument with the type checker. The goal is to build a system that a team of humans can operate, extend, and maintain.

That said, intense type-level machinery is sometimes exactly what you need. We have internal libraries where the types are genuinely hairy: GADTs, type families, phantom types tracking state transitions. These tend to be mechanisms where getting it wrong means money goes to the wrong place or a regulatory invariant is violated. The complexity is absolutely essential here.

The key thing, if you want to do this sustainably, is that we encapsulate the complexity. The module that implements the type-level state machine typically has a small number of authors who understand it deeply and, ideally, a thorough test suite. The module that uses it has a surface API that looks like five normal functions with normal types. A product engineer on another team can call those functions without knowing or caring that underneath there is a small type-level theorem prover ensuring they cannot commit a transaction in the wrong state. The proof obligations are discharged inside the boundary, not leaked across it.

This is the same containment principle as purity, applied one level up. The complexity itself is fine, because it buys you something valuable. What causes problems is complexity that leaks across module boundaries into code maintained by people who did not sign up for it.

## Designing for Introspection

If reliability is about adaptive capacity, introspection is one of the ways you buy it. Operators cannot understand what they cannot see. Teams cannot adapt systems whose internals are opaque. Observability is not a garnish you sprinkle on at the end. It is part of the design surface of the software.

If a library exposes its functionality as a set of concrete top-level functions, your options for instrumenting it are limited to wrapping those functions in a new module and hoping nobody forgets to import yours instead of the original. Hope, it should be said, is not one of the stronger architectural patterns.

You cannot operate what you cannot see. If your traces have large opaque gaps because a library does something expensive and provides no hooks for you to measure it, you will find out what is slow when a customer complains, not when your dashboards tell you. If the dashboards tell you because the customer has already complained, then you are already paying interest on that design decision.

The solution I reach for most often is **records of functions**. Instead of exposing a module full of concrete functions, you expose a record whose fields are the functions. The caller can then wrap, instrument, mock, or replace any individual function without touching the rest. The short version is:

```ts
// A concrete function gives you no leverage.
// You can call it, or you can forget to call it. Those are your options.
async function sendRequest(req: Request): Promise<Response> {
  // ...
}
```

```ts
// A record of functions gives you all of it.
interface HttpClient {
  sendRequest(req: Request): Promise<Response>;
  close(): Promise<void>;
}

function createHttpClient(): HttpClient {
  const manager = new ConnectionManager();
  return {
    async sendRequest(req) {
      // ...
    },
    async close() {
      await manager.close();
    },
  };
}
```

Now you can wrap it without touching the implementation:

```ts
function withMetrics(client: HttpClient): HttpClient {
  return {
    sendRequest: async (req) => {
      const start = performance.now();
      const res = await client.sendRequest(req);
      console.log(`request took ${performance.now() - start}ms`);
      return res;
    },
    close: () => client.close(),
  };
}
```

With the record, you can wrap sendRequest with timing instrumentation and return a new HttpClient. You can inject faults for testing. You can swap the implementation for a mock. You can add retries, tracing, request rewriting, tenant-specific behavior, or whatever other cross-cutting concern production has discovered for you this quarter. All at runtime, without touching the library's source code. The concrete function is a dead end. The record is a seam, and the code that depends on it never needs to know.

## Intervene on Structure, Not Parameters

Donella Meadows's *Leverage Points* orders interventions by strength. The sections below follow that order, strongest first. The transferable idea is not her list, which is social, but its shape: effort is not proportional to leverage. Almost all of it lands on the last entry, where leverage is smallest. Enter at the top, not the bottom.

### Goals bend everything below them

Below the goal sit the local rules and local optimizations. Each is locally rational; together they produce global behavior that nobody chose. So ask what the code is rewarded for: throughput gets you skipped validation, velocity gets you the hard parts deferred to whoever is not measured, line count gets you line count. Local optimization against the wrong goal is not a bug in the local code. In an incident where every patch passes review and the system still gets worse, the problem is above the code that broke.

### Self-organization: the power to add structure

The strongest resilience a system can have is the power to create structure it did not have, and it needs both an inventory of variations and a cheap way to try one. Both get removed by accident: deleting the second implementation of an interface, letting the test suite rot until nobody can add a variant safely, fixing a flaky test by deleting the case. One provider, one code path, one of everything, is a monoculture that survives exactly one kind of failure.

This is the honest counterweight to YAGNI, and the two agree. Do not build a plugin boundary for an implementation that does not exist. Do keep the second instance cheap where one is genuinely plausible: an interface with one implementation is fine, an interface with a hardcoded client welded into the call path is not.

### Information flows: restore the missing feedback

Missing feedback is a cause of malfunction, not an observability gap, and adding it is almost always cheaper than any structural change. The story: identical houses, identical prices, one electric meter in the basement and one in the front hall. Consumption fell thirty percent. Nothing changed but the feedback reaching the person able to act on it.

Three properties decide whether a signal corrects anything. It must arrive where the decision is made — a dashboard nobody owns, an error in a sink nobody opens, corrects nothing. It must be in a form that moves the party whose action caused the consequence; a number no one acts on does not steer. And it must not flatter its own source. Start with the error path: the swallowed exception, the `catch` that returns an empty array, the failure that degrades so the page still renders. See [Designing for Introspection](#designing-for-introspection).

### Rules: leverage lives in who can bypass them

Types, schemas, lint rules, CI gates, permission boundaries. The leverage is not in the rule itself but in who can weaken or bypass it, and a guardrail everyone can turn off is a suggestion. See [Make the Right Thing Easy](#2-make-the-right-thing-easy).

### Positive feedback: cut the gain before adding a brake

A reinforcing loop multiplies, and left alone it ends in exhaustion: the queue backs up into the request path and the service blocks. It always ends; the only question is whether you choose where. Cutting the gain is almost always cheaper and more effective than strengthening the negative loops that fight it. In software these are retry storms, cache stampedes, thundering herds on fanout, hot keys, pool pileups — anything where holding more of a thing buys more of it. Interventions: backoff with jitter, a hard ceiling on total attempts, a cap on concurrent in-flight work, a negative cache for misses, a breaker on the amplification rather than the symptom.

### Negative feedback: strength must track impact

A correcting loop holds only while its strength is proportionate to the disturbance it absorbs. Impact grows, so feedback has to grow with it, or the system lives at saturation, permanently reporting problems it cannot correct. The expensive mistake is stripping the rarely-used responder because it costs maintenance and fires rarely: in the short term nothing looks different, and in the long term the range of failures the system survives is narrower than anyone remembers. Unused is not dead. "This never runs" is a reason to add a test, not to delete the branch.

### Delays only mean something relative to the rate of change

Shorter than the interval between changes, a delay produces jitter and chasing-your-own-tail; longer produces oscillation, damped or sustained or explosive depending on how much longer. So a backoff ceiling shorter than the upstream's recovery time does not add reliability, it synchronizes every client into one second wave. A cache TTL shorter than the propagation time of the change it caches guarantees a stale entry under load. You rarely control the delay itself; you control the rate of change. Slow the rate below the delay, which is cheaper than pretending to remove it.

### Structure: the shape of the graph decides the behavior

Where the dependencies sit is a decision made once and paid for forever. A node every request traverses sets the latency floor, the blast radius, and the queueing behind it, and no tuning inside it repairs the shape. You cannot reflow a badly shaped system cheaply. The leverage is in the shape you pick at design time, then in knowing its bottlenecks and refusing to push past its capacity.

### Buffers: stock size against flow rate

Stability comes from the size of a stock measured against the flow through it: a small stock with fast flows is a river, a large one is a lake. Queues, pools, in-flight budgets, memory headroom, retry-chain length, cache size. Too small and a transient burst becomes permanent overload. Too large and the buffer absorbs the signal, hiding stale data while the system reports health and slowing recovery, because the drain is slow too. Buffers cost money and they hide information. Size them deliberately and know which of the two you are buying.

### Parameters: the bottom rung, where the effort goes

Retry counts, timeouts, batch sizes, pool sizes, flag thresholds, precision cutoffs, cache TTLs. Everyone tunes these first because they are visible, cheap, and reversible, and they rarely change behavior. A chronically stuck system does not get unstuck, a wildly oscillating one does not settle, a runaway one does not brake. Adding retries to an overloaded dependency is not a fix; it is more load on the loop you were trying to stop. Change a parameter only when it is a threshold, or when crossing it flips you onto a higher rung: a rate limit that arms a circuit breaker is a rule, not a number.

Leverage points are counterintuitive. Handed a system and a list of levers, the intuitive move is reliably to push the wrong one harder, and to be confident while doing it. The order is approximate, exceptions move items up and down, and the higher the lever the harder the system pushes back. When a knob keeps failing, that is not the signal to try the next knob down; it is the signal that you are on the wrong rung.

## Other applicable patterns

- Explicit reasonable service timeouts.
- Retry transient failures. With jitter. Honor `Retry-After` headers.
- Minimize. Don't collect or return what you don't need. Every field you ask for is a liability.
- Circuit breaker for chronic failures. When an upstream is failing for many requests in a row, stop calling it for a window—let it recover instead of piling on.
- Concurrency limits on outbound. A sudden burst of requests could fan out unbounded outbound calls—overwhelms upstream, gets you rate-limited, takes your app down with it.
- Stagger whatever must start together. Deploys, cache warmups, and scheduled jobs that every replica fires on the same second are stampedes with a countdown.
