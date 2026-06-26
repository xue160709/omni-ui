# OmniUI

[English](README.md) | [中文](README_CN.md)

OmniUI lets existing React pages safely accept text, voice, and AI-assisted commands without replacing your UI kit or taking ownership of your business state.

OmniUI does not own your business state. Your app owns actions and executors. The model never calls business code directly; it can only propose commands that are validated locally.

## Status

Current status: alpha.
Package version: `0.1.0`.
Protocol version: `1.0`.

Release notes stay under [Unreleased](CHANGELOG.md) until a GitHub Release and npm publication are prepared.

## Installation

For most React apps:

```bash
npm install @omni-ui/react
```

This repository is still pre-release. If a package is not published in your npm environment yet, validate and consume local tarballs with `npm run verify:package-consumer`.

Default styles are explicit:

```ts
import "@omni-ui/react/styles.css"
```

The root `@omni-ui/react` entry does not import CSS for you.

## Which Package Should I Use?

- Most React apps: `@omni-ui/react`
- Framework-agnostic protocols, validation, command envelopes, resolver adapters, or server integration: `@omni-ui/core`
- Optional shadcn/ui source components and registry recipes: `@omni-ui/shadcn`

You do not need shadcn to use the OmniUI runtime. React apps usually do not install `@omni-ui/core` directly because `@omni-ui/react` depends on it and re-exports the common APIs.

## 5-Minute Local Command

The first command needs no LLM API key, microphone permission, shadcn dependency, or server resolver.

Import styles once in your app entry:

```tsx
import "@omni-ui/react/styles.css"
```

Then register a local rule, mark visible Todo rows, and bind an app-owned executor:

```tsx
import * as React from "react"
import {
  CommandInput,
  MultimodalGroup,
  MultimodalPage,
  MultimodalProvider,
  defineAction,
  defineMultimodalConfig,
  useActionExecutor,
} from "@omni-ui/react"

type Todo = {
  id: string
  title: string
  completed: boolean
}

const completeTodo = defineAction<{ todoId: string }>({
  id: "todo.complete",
  title: "Complete todo",
  description: "Mark one todo as complete",
  attachTo: { entityType: "todo" },
  executeScope: "object",
  risk: "low",
  voiceCallable: true,
  modelCallable: false,
  paramsFrom: ({ target }) => ({ todoId: target.entity?.id }),
  paramsSchema: {
    safeParse(input) {
      const value = input as Record<string, unknown>
      return typeof value.todoId === "string"
        ? { success: true, data: { todoId: value.todoId } }
        : { success: false, error: "todoId must be a string" }
    },
  },
})

const config = defineMultimodalConfig({
  rules: [
    {
      id: "todo.complete",
      patterns: ["完成第{item}个任务", "完成{target}"],
      target: "entity.todo.byLabelOrIndex",
      actionId: "todo.complete",
    },
  ],
})

export function App() {
  return (
    <MultimodalProvider config={config}>
      <TodoPage />
    </MultimodalProvider>
  )
}

function TodoPage() {
  const [todos, setTodos] = React.useState<Todo[]>([
    { id: "todo_1", title: "Review launch checklist", completed: false },
    { id: "todo_2", title: "Send design notes", completed: false },
  ])

  useActionExecutor(completeTodo, async ({ todoId }) => {
    setTodos((current) =>
      current.map((todo) =>
        todo.id === todoId ? { ...todo, completed: true } : todo
      )
    )
    return { status: "changed" }
  })

  return (
    <MultimodalPage id="page.todos" title="Todos" route="/todos">
      <CommandInput aria-label="Command" placeholder="完成第一个任务" />
      <ul>
        {todos.map((todo) => (
          <MultimodalGroup
            key={todo.id}
            id={`todo.item.${todo.id}`}
            role="list_item"
            label={todo.title}
            entity={{ type: "todo", id: todo.id }}
            state={{ completed: todo.completed }}
          >
            <li>{todo.title}</li>
          </MultimodalGroup>
        ))}
      </ul>
    </MultimodalPage>
  )
}
```

Type `完成第一个任务` into `CommandInput`. The local rule resolves the visible first Todo, validates `todo.complete`, runs your executor, and the row state changes.

The same flow is kept as a build-checked example in [`examples/react-vite-minimal`](examples/react-vite-minimal/).

## How OmniUI Works

```text
User input
  -> Snapshot + Manifest
  -> Resolver Chain
  -> Validation / Policy / Confirmation
  -> CommandEnvelope
  -> Dispatcher
  -> App-owned Executor
  -> Feedback / DevTools
```

External resolvers can propose candidate commands, but local validation, policy, confirmation, and executors remain inside your app.

## Examples

- [`examples/react-vite-minimal`](examples/react-vite-minimal/) is the first integration path and does not require a model key.
- [`apps/demo-todo`](apps/demo-todo/) exercises the richer demo app, optional registry output, and package-consumer checks.

## Documentation

- [Quick Start](docs/getting-started/quick-start.md)
- [Chinese Quick Start](docs/getting-started/quick-start.zh-CN.md)
- [Concepts](docs/concepts/index.md)
- [DevTools](docs/guides/devtools.md)
- [Error Codes](docs/troubleshooting/error-codes.md)
- [Security and Model Keys](docs/architecture/security.md)
- [Server Resolver](docs/guides/server-resolver.md)
- [Release Process](docs/release.md)

## Development

```bash
npm install
npm run dev
npm run verify:release
```

`npm run dev` starts the `apps/demo-todo` development server. `npm run verify:release` runs typecheck, unit tests, builds, registry validation, the minimal example, and package-consumer tarball checks.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [packages/README.md](packages/README.md) for contributor-oriented package details.
