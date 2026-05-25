import type {
  ActionAttachTarget,
  ExecuteScope,
  InteractionObject,
  RegisteredActionSpec,
  RiskLevel,
} from "./types"

// 中文：默认导航 action 由库提供，应用只需要注册路由和执行函数。
// English: The default navigation action is provided by the library; apps only register routes and executors.
export const NAVIGATION_GOTO_ACTION_ID = "navigation.goto"
export const NAVIGATION_BACK_ACTION_ID = "navigation.back"
export const NAVIGATION_FORWARD_ACTION_ID = "navigation.forward"

export type AppManifestRoute<TRoute = unknown> = {
  id: string
  label: string
  path?: string
  route?: TRoute
  aliases?: string[]
  active?: boolean
  state?: Record<string, unknown>
  actionId?: string
}

export type AppManifestAction = {
  id: string
  namespace?: string
  label?: string
  aliases?: string[]
  attachTo?: ActionAttachTarget
  executeScope: ExecuteScope
  risk?: RiskLevel
  requiresConfirmation?: boolean
}

export type AppInteractionManifest = {
  routes?: AppManifestRoute[]
  actions?: AppManifestAction[]
  objects?: InteractionObject[]
}

export type LlmManifestRoute = {
  id: string
  label: string
  path?: string
  aliases?: string[]
  active?: boolean
  state?: Record<string, unknown>
  actionId: string
}

export type LlmManifestAction = AppManifestAction

export type LlmInteractionManifest = {
  routes: LlmManifestRoute[]
  actions: LlmManifestAction[]
  objects: Array<Pick<InteractionObject, "id" | "type" | "role" | "label" | "aliases" | "state" | "actions">>
}

export function defineInteractionManifest<TManifest extends AppInteractionManifest>(
  manifest: TManifest
): TManifest {
  return manifest
}

// 中文：按 id 合并多个 manifest，后注册的条目覆盖同 id 的旧条目。
// English: Merges manifests by id, letting later entries replace earlier entries with the same id.
export function mergeInteractionManifests(
  ...manifests: Array<AppInteractionManifest | undefined>
): AppInteractionManifest | undefined {
  const routes = new Map<string, AppManifestRoute>()
  const actions = new Map<string, AppManifestAction>()
  const objects = new Map<string, InteractionObject>()

  manifests.forEach((manifest) => {
    manifest?.routes?.forEach((route) => routes.set(route.id, route))
    manifest?.actions?.forEach((action) => actions.set(action.id, action))
    manifest?.objects?.forEach((object) => objects.set(object.id, object))
  })

  if (!routes.size && !actions.size && !objects.size) return undefined

  return {
    routes: Array.from(routes.values()),
    actions: Array.from(actions.values()),
    objects: Array.from(objects.values()),
  }
}

// 中文：把 manifest 里的跨页面能力转成可见对象，让规则解析器和 LLM 能像查 UI 一样查路由。
// English: Converts cross-page manifest capabilities into objects so rules and LLMs can search routes like UI targets.
export function createManifestObjects(manifest?: AppInteractionManifest): InteractionObject[] {
  if (!manifest) return []

  const routeObjects = (manifest.routes ?? []).map<InteractionObject>((route) => ({
    id: route.id,
    type: "composite",
    role: "route",
    label: route.label,
    aliases: route.aliases,
    source: "manifest_route",
    state: {
      routeId: route.id,
      path: route.path,
      active: route.active,
      ...(route.state ?? {}),
    },
    actions: [route.actionId ?? NAVIGATION_GOTO_ACTION_ID],
  }))

  return [...routeObjects, ...(manifest.objects ?? [])]
}

// 中文：把运行时注册的 action spec 降级为 manifest action，只保留可公开给解析器的元数据。
// English: Downgrades registered action specs into manifest actions, keeping only resolver-facing metadata.
export function actionSpecToManifestAction(spec: RegisteredActionSpec): AppManifestAction {
  return {
    id: spec.id,
    namespace: spec.namespace,
    attachTo: spec.attachTo,
    executeScope: spec.executeScope,
    risk: spec.risk,
    requiresConfirmation: spec.requiresConfirmation,
  }
}

// 中文：为 LLM 生成精简 manifest，上下文只包含稳定、可 JSON 化、可执行决策需要的信息。
// English: Builds a compact LLM manifest with stable, JSON-safe fields needed for execution decisions.
export function createLlmManifestContext(
  manifest?: AppInteractionManifest
): LlmInteractionManifest | undefined {
  if (!manifest) return undefined

  return {
    routes: (manifest.routes ?? []).map((route) => ({
      id: route.id,
      label: route.label,
      path: route.path,
      aliases: route.aliases,
      active: route.active,
      state: sanitizeManifestState(route.state) as Record<string, unknown> | undefined,
      actionId: route.actionId ?? NAVIGATION_GOTO_ACTION_ID,
    })),
    actions: (manifest.actions ?? []).map((action) => ({
      id: action.id,
      namespace: action.namespace,
      label: action.label,
      aliases: action.aliases,
      attachTo: action.attachTo,
      executeScope: action.executeScope,
      risk: action.risk,
      requiresConfirmation: action.requiresConfirmation,
    })),
    objects: (manifest.objects ?? []).map((object) => ({
      id: object.id,
      type: object.type,
      role: object.role,
      label: object.label,
      aliases: object.aliases,
      state: sanitizeManifestState(object.state) as Record<string, unknown> | undefined,
      actions: object.actions,
    })),
  }
}

// 中文：manifest state 可能来自任意应用对象，这里会去掉函数、symbol、循环引用等不可安全序列化的值。
// English: Manifest state can come from arbitrary app objects, so unsafe values such as functions, symbols, and cycles are removed.
function sanitizeManifestState(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value == null) return value
  if (typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (typeof value === "bigint") return value.toString()
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "undefined") {
    return undefined
  }
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeManifestState(item, seen))
      .filter((item) => typeof item !== "undefined")
  }
  if (typeof value === "object") {
    if (seen.has(value)) return undefined
    seen.add(value)
    const output: Record<string, unknown> = {}
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      const sanitized = sanitizeManifestState(item, seen)
      if (typeof sanitized !== "undefined") output[key] = sanitized
    })
    seen.delete(value)
    return output
  }
  return undefined
}
