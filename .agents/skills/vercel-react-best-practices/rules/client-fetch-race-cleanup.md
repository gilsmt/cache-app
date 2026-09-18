---
title: Handle Fetch Race Conditions with Effect Cleanup
impact: MEDIUM
impactDescription: prevents stale responses from overwriting fresh state
tags: client, useEffect, data-fetching, race-conditions
---

## Handle Fetch Race Conditions with Effect Cleanup

Fetching inside an Effect is correct when the request depends on props or state, but a slow response can arrive after a newer one and overwrite fresh UI. Guard the result with a cleanup flag so stale responses are ignored.

Prefer [SWR](./client-swr-dedup.md) or a Server Component for shared or cacheable data. Use this pattern when a raw Effect fetch is required.

**Incorrect (stale response overwrites fresh state):**

```tsx
function Results({ query }: { query: string }) {
  const [results, setResults] = useState<Result[]>([])

  useEffect(() => {
    fetchResults(query).then((json) => {
      setResults(json)
    })
  }, [query])

  // ...
}
```

**Correct (cleanup ignores stale responses):**

```tsx
function Results({ query }: { query: string }) {
  const [results, setResults] = useState<Result[]>([])

  useEffect(() => {
    let ignore = false
    fetchResults(query).then((json) => {
      if (!ignore) setResults(json)
    })
    return () => {
      ignore = true
    }
  }, [query])

  // ...
}
```

Reference: [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
