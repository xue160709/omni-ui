# OmniUI

[English](README.md) | [中文](README_CN.md)

Let an existing React page safely accept text, voice, and AI-assisted commands without replacing your UI kit or business state.

Install the runtime:

```bash
npm install @omni-ui/react
```

React + shadcn/ui users can also install optional editable registry components from `@omni-ui/shadcn`. Non-React runtimes and server adapters can build on `@omni-ui/core`.

## 5-Minute Local Command

The first command needs no model API key, microphone permission, or shadcn dependency.

```tsx
import {
  CommandInput,
  MultimodalGroup,
  MultimodalPage,
  MultimodalProvider,
  defineAction,
  defineMultimodalConfig,
  useActionExecutor,
} from "@omni-ui/react"

const completeTodo = defineAction({
  id: "todo.complete",
  title: "Complete todo",
  attachTo: { entityType: "todo" },
  executeScope: "object",
  risk: "low",
  modelCallable: false,
  paramsFrom: ({ target }) => ({ todoId: target.entity?.id }),
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

function App() {
  return (
    <MultimodalProvider config={config}>
      <TodoPage />
    </MultimodalProvider>
  )
}

function TodoPage() {
  const todos = useTodos()

  useActionExecutor(completeTodo, async ({ todoId }) => {
    await todoService.complete(todoId)
    return { status: "changed" }
  })

  return (
    <MultimodalPage id="page.todos" title="Todos" route="/todos">
      <CommandInput placeholder="完成第一个任务" />
      {todos.map((todo) => (
        <MultimodalGroup
          key={todo.id}
          id={`todo.item.${todo.id}`}
          role="list_item"
          label={todo.title}
          entity={{ type: "todo", id: todo.id }}
        >
          <TodoItem todo={todo} />
        </MultimodalGroup>
      ))}
    </MultimodalPage>
  )
}
```

`todo.complete` is app-owned. OmniUI does not ship Todo, CRM, inbox, or other domain actions. Apps register their own domain actions and execute them through the same reducer/service used by GUI clicks.

The execution path now freezes each resolved request into a `CommandEnvelope` and sends it through the unified Dispatcher. Model-generated writes must pass the runtime policy, `modelCallable: true`, params schema, scope checks, target/action attachment, confirmation policy, and the current snapshot anchor. Legacy executors that return `void` are treated as `unverified`; prefer returning `{ status: "changed" }`, `noop`, `rejected`, or `pending` so chat and voice feedback do not say “completed” when an operation was only submitted.

The low-level API also exposes turn-level controls: `useInteractionApi()` includes `resolveVoice()`, `submitVoice()`, `getActiveTurn()`, `getTurn()`, `confirmTurn()`, and `cancelTurn()`. Confirmation dispatches the same frozen command instead of reparsing the previous model reply.

ASR vendors can integrate through the `VoiceAdapter` seam and `useVoiceAdapter()`: adapters publish `partial` and `final` `VoiceInput` events, while the runtime keeps partials as previews and submits finals through the normal Turn/Dispatcher flow.

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
import { defineMultimodalConfig } from "@omni-ui/react"

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

The registry is not required for runtime integration. It is a source-code starter kit for teams that want shadcn-style multimodal components and recipes. Generated registry files are written to `apps/demo-todo/public/r`.

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

Install local registry items with the shadcn CLI while the docs app is running:

```bash
npx shadcn@latest add http://127.0.0.1:5173/r/multimodal-provider.json
```

## Resolver Model

By default, the runtime uses the built-in rule resolver. It is offline and handles visible-speak commands against the current Interaction Snapshot.

Configured local rules from `defineMultimodalConfig({ rules })` are tried before external LLM resolvers, so app-specific deterministic commands can stay local.

LLM support is opt-in through the `IntentResolver` interface. The LLM can propose candidates, but it cannot execute actions directly; local validation still enforces scope, state version, availability, and confirmation policies.

LLM prompts receive the user utterance, a compact Interaction Snapshot, a compact App Manifest, and the expected JSON schema. They do not receive the whole project, source code, or unregistered pages.

Provider helpers read API keys from environment variables. Set `OPENAI_API_KEY` + `OPENAI_MODEL` or `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL`; optional base URLs can come from `OPENAI_BASE_URL` or `ANTHROPIC_BASE_URL`.

```ts
// Server-only code. Do not bundle this file into the browser.
import { createOpenAIResolver } from "@omni-ui/core"

const resolver = createOpenAIResolver()
```

Use these helpers from a server or trusted runtime. In browser apps, keep API keys on your server and expose a small resolver endpoint.

```ts
const resolution = await resolver.resolve({ utterance, snapshot })
```

## Low-level Interaction API

The runtime is not tied to a specific dialog UI. Any input surface can drive the formal Turn flow directly:

```tsx
import { useInteractionApi } from "@omni-ui/react"

function MyInput() {
  const interaction = useInteractionApi()

  async function send(text: string) {
    const snapshot = interaction.getSnapshot()
    const resolved = await interaction.resolveText(text)
    const turnId = resolved.resolution.provenance?.turnId

    if (!turnId) return { snapshot, resolved, submitted: undefined }

    const submitted = await interaction.submitTurn(turnId)
    return { snapshot, resolved, submitted }
  }
}
```

- `getSnapshot()` returns the current page, visible objects, state, focus, and registered actions.
- `resolveText(text)` creates or updates an `InteractionTurn`, resolves hypotheses/candidates, and returns a compatibility projection with Turn provenance.
- `submitTurn(turnId)` validates and executes the frozen Turn decision; invalid submissions throw a stable `OmniError` such as `OMNI_TURN_NOT_FOUND`, `OMNI_TURN_NOT_SUBMITTABLE`, `OMNI_VOICE_PARTIAL_NOT_SUBMITTABLE`, or `OMNI_TURN_TERMINAL`.
- `trySubmitTurn(turnId)` is the non-throwing form for callers that prefer an explicit `{ ok, turn?, error? }` result.

### Legacy / Migration

- `submitUtterance(text)` remains a convenience wrapper that resolves, validates, and executes in one call.
- `dispatchResolution(resolution)` is for compatibility with older `ResolvedInteraction` callers and requires command provenance for formal execution.

```tsx
const turn = await interaction.resolveVoice(partialInput)

const submitted = await interaction.trySubmitTurn(turn.id)
if (!submitted.ok && submitted.error.code === "OMNI_VOICE_PARTIAL_NOT_SUBMITTABLE") {
  // Keep rendering the preview; wait for the ASR final before submitting.
}
```

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

`useAssistantConversation()` wraps the common chatbot path: message state, deterministic local fast path, LLM fallback, risky-action confirmation, and local replies. The hook is provider-agnostic; pass any `callModel(messages)` implementation for OpenAI-compatible APIs, Anthropic, or your own gateway.

```tsx
const conversation = useAssistantConversation({
  assistantOptions: {
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
  },
  callModel: async (messages) => {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
    })
    const data = await response.json()
    return data.content
  },
})

await conversation.submitMessage()
```

`localFastPath` is app-owned JSON for commands that can skip the LLM, such as route changes or closing a dialog. `modelActionPolicy` is the separate gate for model proposals. Prefer `interaction_hypotheses` replies so the model only supplies intent, target reference, slots, and confidence; the runtime then performs snapshot/fusion arbitration before dispatch. Legacy `interaction_action` JSON remains supported as a command proposal. Both policies support exact values and prefix wildcards such as `navigation.*`; `localExecution` remains as a backwards-compatible alias for `localFastPath`.

Your `/api/chat` endpoint can call an OpenAI-compatible `/chat/completions` API, Anthropic Messages, or any provider that returns the assistant text. Browser code should send messages to your server, not provider API keys directly.

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

Roadmap items after `v0.2` are directional and may move as the API stabilizes.
