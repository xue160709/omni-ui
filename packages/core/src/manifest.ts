import type {
  ActionAttachTarget,
  ExecuteScope,
  InteractionObject,
  RegisteredActionSpec,
  RiskLevel,
} from "./types"

export const NAVIGATION_GOTO_ACTION_ID = "navigation.goto"

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
