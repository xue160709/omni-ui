# Multimodal UI

Runtime-first multimodal interaction primitives for React.

Multimodal UI turns the current GUI into a compact Interaction Snapshot, resolves visible speech commands such as "click add" or "complete the first item", validates the requested action, and dispatches through the same command handler used by GUI clicks.

The core product is `@multimodal-ui/react`: use it to add multimodal behavior to an existing React app without replacing your UI library. The shadcn registry is optional; it provides editable starter components and recipes for teams that want a faster default UI kit.

## Packages

- `@multimodal-ui/core`: framework-agnostic types, snapshot creation, action registry, resolver contracts, validation, and feedback primitives.
- `@multimodal-ui/react`: React runtime, DOM/ARIA extraction, provider, hooks, and default feedback styles.
- `@multimodal-ui/shadcn`: optional shadcn registry source for editable wrappers and starter recipes installed into `components/multimodal/*`.
- `apps/docs`: local mobile TodoList project with bottom tabs, todo detail screens, a floating Chatbot, and settings.

For app integration, see [packages/README.md](packages/README.md).

## Two Product Lines

**Runtime integration** is the default path for existing apps:

```text
Use @multimodal-ui/react with your current Button, Input, Dialog, Table, routes, and state.
Mark business objects with MultimodalGroup.
Register domain actions with useInteractionActions.
```

**UI kit / registry** is the optional path for new projects or shadcn users:

```text
Install editable source files from the registry into components/multimodal/*.
Keep using your local components/ui/* and theme tokens.
Customize the installed code like any other app code.
```

## Quick Start

Install dependencies and run the local TodoList app:

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

The local app exposes `/`, `/todos`, `/todos/:id`, `/projects`, `/projects/:id`, `/calendar`, `/kanban`, `/analytics`, and `/settings`. Chatbot is a global floating sheet opened from the bottom tab, so it stays available while you move between pages. Visiting `/chat` opens the same floating sheet over Home for compatibility. Enter your SiliconFlow API key in the Settings tab before sending messages.

You can also set `SILICONFLOW_API_KEY` before starting Vite as a server-side fallback, but local UI usage should go through Settings.

Do not open `apps/docs/index.html` directly with `file://`; the TodoList app is served by Vite.

Try these utterances in the demo:

```text
完成第一个
打开 Chatbot
只看今天
清空已完成
把买牛奶那个完成
只显示还没做完的
```

## Minimal React Usage

```tsx
import {
  defineMultimodalConfig,
  MultimodalProvider,
  MultimodalPage,
  MultimodalGroup,
  useInteractionActions,
} from "@multimodal-ui/react"

const multimodalConfig = defineMultimodalConfig({
  rules: [
    {
      id: "navigation.goto",
      patterns: ["打开{route}", "去{route}", "进入{route}", "回到{route}"],
      target: "route.byLabel",
      actionId: "navigation.goto",
    },
  ],
})

function App() {
  return (
    <MultimodalProvider config={multimodalConfig}>
      <MultimodalPage id="page.todo" title="Todo" route="/todo">
        <TodoPage />
      </MultimodalPage>
    </MultimodalProvider>
  )
}

function TodoItem({ todo, executeTodoAction }) {
  return (
    <MultimodalGroup
      id={`todo.item.${todo.id}`}
      role="list_item"
      label={todo.title}
      entity={{ type: "todo", id: todo.id }}
    >
      <button onClick={() => executeTodoAction({ type: "todo.complete", todoId: todo.id })}>
        完成
      </button>
      <span>{todo.title}</span>
    </MultimodalGroup>
  )
}
```

Register domain actions once in the page:

```tsx
useInteractionActions({
  namespace: "todo",
  actions: {
    "todo.complete": {
      attachTo: { entityType: "todo" },
      executeScope: "object",
      paramsFrom: ({ target }) => ({ todoId: target.entity?.id }),
      availableWhen: ({ target }) => target.state?.completed === false,
    },
  },
  execute: executeTodoAction,
})
```

`todo.complete` is app-owned. Multimodal UI does not ship Todo, CRM, inbox, or other domain actions. Apps register their own domain actions and execute them through the same reducer/service used by GUI clicks.

## App Manifest and Local Rules

The runtime now keeps two context layers:

- The current Interaction Snapshot: live page, visible objects, state, focus, and currently executable actions.
- The App Manifest: global capabilities such as registered routes and app-level commands that do not require the target page to be mounted.

Developers should not hand-write a whole app map for LLMs. Use route/action registration APIs at the app root; they are merged into the manifest automatically.

```tsx
useInteractionRoutes({
  routes: [
    { id: "app.route.home", label: "Home", route: { screen: "home" }, path: "/" },
    { id: "app.route.settings", label: "Settings", route: { screen: "settings" }, path: "/settings" },
  ],
  execute: (route) => navigate(route),
})
```

`useInteractionRoutes()` registers the built-in `navigation.goto` action, exposes route objects for local resolution, and contributes route metadata to the LLM manifest context.

Apps can add deterministic local rules in a JSON/TS config:

```ts
import { defineMultimodalConfig } from "@multimodal-ui/react"

export default defineMultimodalConfig({
  rules: [
    {
      id: "navigation.goto",
      patterns: ["打开{route}", "去{route}", "进入{route}"],
      target: "route.byLabel",
      actionId: "navigation.goto",
    },
    {
      id: "issue.close",
      patterns: ["关闭{issue}", "把{issue}关闭"],
      target: "entity.issue.byLabelOrIndex",
      actionId: "issue.close",
    },
  ],
})
```

The route rule uses the library-provided `navigation.goto`. The `issue.close` action is still implemented by the app with `useInteractionActions()`.

## Optional shadcn Registry

The registry is not required for runtime integration. It is a source-code starter kit for teams that want shadcn-style multimodal components and recipes. Generated registry files are written to `apps/docs/public/r`.

```bash
npm run registry:build
```

During local development, registry items are available at:

```text
http://127.0.0.1:5173/r/index.json
http://127.0.0.1:5173/r/multimodal-provider.json
```

The registry installs wrappers into `components/multimodal/*` and does not overwrite `components/ui/*`.
Installed files are project-owned source code, so developers can edit class names, layout, behavior, and theme usage directly.

## Resolver Model

By default, the runtime uses the built-in rule resolver. It is offline and handles visible-speak commands against the current Interaction Snapshot.

Configured local rules from `defineMultimodalConfig({ rules })` are tried before external LLM resolvers, so app-specific deterministic commands can stay local.

LLM support is opt-in through the `IntentResolver` interface. The LLM can propose candidates, but it cannot execute actions directly; local validation still enforces scope, state version, availability, and confirmation policies.

LLM prompts receive the user utterance, a compact Interaction Snapshot, a compact App Manifest, and the expected JSON schema. They do not receive the whole project, source code, or unregistered pages.

Provider helpers read API keys from environment variables. Set `OPENAI_API_KEY` + `OPENAI_MODEL` or `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL`; optional base URLs can come from `OPENAI_BASE_URL` or `ANTHROPIC_BASE_URL`.

```ts
import { createOpenAIResolver } from "@multimodal-ui/react"

const resolver = createOpenAIResolver()
```

Use these helpers from a server or trusted runtime. In browser apps, keep API keys on your server and expose a small resolver endpoint.

```ts
const resolution = await resolver.resolve({ utterance, snapshot })
```

## Low-level Interaction API

The runtime is not tied to a specific dialog UI. Any input surface can call the API directly:

```tsx
import { useInteractionApi } from "@multimodal-ui/react"

function MyInput() {
  const interaction = useInteractionApi()

  async function send(text: string) {
    const snapshot = interaction.getSnapshot()
    const resolved = await interaction.resolveText(text)
    const submitted = await interaction.submitUtterance(text)

    return { snapshot, resolved, submitted }
  }
}
```

- `getSnapshot()` returns the current page, visible objects, state, focus, and registered actions.
- `resolveText(text)` calls the rule/LLM resolver and returns the proposed target/action without executing it.
- `submitUtterance(text)` resolves, validates, executes the matching domain or primitive action, and returns a structured result.

## Assistant and Route Helpers

Apps can register non-DOM route targets once, then let chat or voice surfaces execute navigation through the same validated dispatcher:

```tsx
useInteractionRoutes({
  routes: [
    { id: "app.route.home", label: "Home", route: { screen: "home" }, aliases: ["main"] },
    { id: "app.route.settings", label: "Settings", route: { screen: "settings" } },
  ],
  execute: (route) => navigate(route),
})
```

`useInteractionAssistant()` wraps the common chatbot path: try a deterministic local fast path first, generate a local reply when something executed, and build an Interaction Snapshot system prompt for LLM fallback. LLM action replies still pass through a separate model action policy before the validated dispatcher runs them.

```tsx
const assistant = useInteractionAssistant({
  localFastPath: {
    mode: "allowlist",
    actionIds: ["navigation.*"],
    allowPrimitiveActions: false,
  },
  modelActionPolicy: {
    mode: "allowlist",
    actionIds: ["navigation.*", "todo.complete", "todo.update"],
    allowPrimitiveActions: false,
    requireConfirmationForRisk: ["medium", "high"],
  },
  localReply: {
    actionReplies: {
      "navigation.goto": ({ result }) => `Opened ${result.target?.label}.`,
    },
  },
})

const local = await assistant.trySubmitLocal(text)
const messages = assistant.createChatMessages([{ role: "user", content: text }])
```

`localFastPath` is app-owned JSON for commands that can skip the LLM, such as route changes or closing a dialog. `modelActionPolicy` is the separate gate for action JSON returned by the LLM. Both policies support exact values and prefix wildcards such as `navigation.*`; `localExecution` remains as a backwards-compatible alias for `localFastPath`.

## Verification

```bash
npm run verify
```

The verification command runs typecheck, tests, runtime package builds, and the docs production build.

Registry verification is separate:

```bash
npm run verify:registry
```

## Version Roadmap

- `v0.1`: runtime-first visible-speak MVP.
- `v0.2`: optional shadcn registry recipes for assistant panels, forms, data views, and starter layouts.
- `v0.3`: resolver plugins and opt-in LLM intent understanding.
- `v0.4`: gaze, gesture, keyboard target hints, and multimodal event fusion.
