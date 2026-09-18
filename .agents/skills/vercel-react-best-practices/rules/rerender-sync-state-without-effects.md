---
title: Sync State Without Effects
impact: MEDIUM
impactDescription: avoids extra renders, cascading updates, and state drift
tags: rerender, useEffect, state, derived-state, key
---

## Sync State Without Effects

Effects sync with external systems. Do not use Effects to keep React state in sync with props or other state, or to chain one state update after another. Derive values during render, reset with `key`, lift state, or update in the event handler that caused the change.

Use this decision tree for code that runs on update:

- Component displayed → Effect (subscribe, fetch with cleanup, measure DOM).
- User action → event handler.
- Value calculable from props/state → calculate during render.

When NOT to use Effects: transform data for rendering, handle user events, update state based on other state.

**Incorrect (derived list stored via Effect):**

```tsx
function TodoList({ todos, filter }: Props) {
  const [visibleTodos, setVisibleTodos] = useState<Todo[]>([])

  useEffect(() => {
    setVisibleTodos(getFilteredTodos(todos, filter))
  }, [todos, filter])

  return <List items={visibleTodos} />
}
```

**Correct (derive during render, memoize only if expensive):**

```tsx
function TodoList({ todos, filter }: Props) {
  const visibleTodos = useMemo(
    () => getFilteredTodos(todos, filter),
    [todos, filter]
  )

  return <List items={visibleTodos} />
}
```

Measure with `console.time()`/`console.timeEnd()`. Memoize when the computation costs around 1ms or more. Leave cheap derivations as plain expressions.

**Incorrect (reset state in Effect on prop change):**

```tsx
function Profile({ userId }: { userId: string }) {
  const [comment, setComment] = useState('')

  useEffect(() => {
    setComment('')
  }, [userId])

  return <Editor comment={comment} onChange={setComment} />
}
```

**Correct (use key to reset):**

```tsx
function Page({ userId }: { userId: string }) {
  return <Profile userId={userId} key={userId} />
}
```

**Incorrect (adjust state in Effect on prop change):**

```tsx
function Picker({ items }: { items: Item[] }) {
  const [selection, setSelection] = useState<Item | null>(null)

  useEffect(() => {
    setSelection(null)
  }, [items])

  // ...
}
```

**Correct (derive the adjusted value during render):**

```tsx
function Picker({ items }: { items: Item[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selection = items.find((item) => item.id === selectedId) ?? null

  // ...
}
```

**Incorrect (cascading Effects):**

```tsx
useEffect(() => {
  setGoldCardCount((c) => c + 1)
}, [card])
useEffect(() => {
  setRound((r) => r + 1)
}, [goldCardCount])
useEffect(() => {
  setIsGameOver(true)
}, [round])
```

**Correct (calculate and update in the handler):**

```tsx
const isGameOver = round > 5

function handlePlaceCard(nextCard: Card) {
  setCard(nextCard)
  if (nextCard.gold) {
    if (goldCardCount < 3) {
      setGoldCardCount(goldCardCount + 1)
    } else {
      setGoldCardCount(0)
      setRound(round + 1)
    }
  }
}
```

**Incorrect (notify parent from Effect):**

```tsx
function Toggle({ onChange }: { onChange: (value: boolean) => void }) {
  const [isOn, setIsOn] = useState(false)

  useEffect(() => {
    onChange(isOn)
  }, [isOn, onChange])

  // ...
}
```

**Correct (update both in the handler, or lift state):**

```tsx
function Toggle({ onChange }: { onChange: (value: boolean) => void }) {
  const [isOn, setIsOn] = useState(false)

  function updateToggle(nextIsOn: boolean) {
    setIsOn(nextIsOn)
    onChange(nextIsOn)
  }

  // ...
}

// Also good: controlled component with lifted state
function Toggle({ isOn, onChange }: { isOn: boolean; onChange: (value: boolean) => void }) {
  function handleClick() {
    onChange(!isOn)
  }

  // ...
}
```

**Incorrect (child fetches, passes data up via Effect):**

```tsx
function Child({ onFetched }: { onFetched: (data: Data) => void }) {
  const [data, setData] = useState<Data | null>(null)

  useEffect(() => {
    if (data) onFetched(data)
  }, [data])

  // ...
}
```

**Correct (parent fetches, passes data down):**

```tsx
function Parent() {
  const data = useSomeAPI()
  return <Child data={data} />
}
```

**Note:** If your project has [React Compiler](https://react.dev/learn/react-compiler) enabled, manual `useMemo` is unnecessary. The compiler memoizes derived values automatically.

Reference: [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
