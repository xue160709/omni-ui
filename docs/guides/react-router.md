# React Router

Wrap the router tree once with `MultimodalProvider`, then register each route page with `MultimodalPage`.

Route navigation should remain app-owned. Register route actions with `useInteractionRoutes()` or a domain action whose executor calls your existing `navigate()` function.

```tsx
function TodoRoute() {
  return (
    <MultimodalPage id="page.todos" title="Todos" route="/todos">
      <TodoPage />
    </MultimodalPage>
  )
}
```
