---
title: Subscribe to External Stores with useSyncExternalStore
impact: LOW
impactDescription: avoids torn reads and manual subscription bugs
tags: advanced, useSyncExternalStore, subscription, useEffect
---

## Subscribe to External Stores with useSyncExternalStore

Do not hand-roll external store subscriptions with `useEffect` and `addEventListener`. Manual subscriptions miss server snapshots and can tear under concurrent rendering. Use `useSyncExternalStore` instead.

**Incorrect (manual subscription in Effect):**

```tsx
function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    const handler = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', handler)
    window.addEventListener('offline', handler)
    return () => {
      window.removeEventListener('online', handler)
      window.removeEventListener('offline', handler)
    }
  }, [])

  return isOnline
}
```

**Correct (dedicated subscription API):**

```tsx
function subscribe(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

function useOnlineStatus() {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
}
```

Reference: [useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)
