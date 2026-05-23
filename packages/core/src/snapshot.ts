import { attachDomainActions } from "./action-registry"
import type {
  ContextObject,
  EntityRef,
  ExecuteScope,
  FocusInfo,
  InteractionEvent,
  InteractionObject,
  InteractionSnapshot,
  InteractionObjectType,
  InteractionState,
  PageObject,
  PrimitiveAction,
  RiskLevel,
  RegisteredActionSpec,
} from "./types"

let snapshotCounter = 0

export type CreateSnapshotInput = {
  stateVersion: number
  page?: PageObject
  contextStack?: ContextObject[]
  visibleObjects: InteractionObject[]
  focus?: FocusInfo
  recentEvents?: InteractionEvent[]
  actionSpecs?: Record<string, RegisteredActionSpec>
  session?: InteractionSnapshot["session"]
}

export type LlmSnapshotContextOptions = {
  maxObjects?: number
  includeRecentEvents?: boolean
}

export type LlmSnapshotContextObject = {
  id: string
  type: InteractionObjectType
  role: string
  label?: string
  aliases?: string[]
  title?: string
  route?: string
  parent?: string
  children?: string[]
  primaryControl?: string
  entity?: EntityRef
  state?: InteractionState
  actions?: string[]
  primitiveActions?: PrimitiveAction[]
  options?: InteractionObject["options"]
}

export type LlmSnapshotContextAction = {
  id: string
  namespace?: string
  attachTo?: RegisteredActionSpec["attachTo"]
  executeScope: ExecuteScope
  risk?: RiskLevel
  requiresConfirmation?: boolean
}

export type LlmSnapshotContext = {
  snapshotId: string
  stateVersion: number
  session?: InteractionSnapshot["session"]
  contextStack: ContextObject[]
  page?: LlmSnapshotContextObject
  focus?: FocusInfo
  recentEvents?: InteractionEvent[]
  visibleObjects: LlmSnapshotContextObject[]
  objectCount: number
  omittedObjectCount: number
  actions: LlmSnapshotContextAction[]
}

export function createInteractionSnapshot(input: CreateSnapshotInput): InteractionSnapshot {
  const snapshotId = `snapshot_${++snapshotCounter}`
  const actionSpecs = input.actionSpecs ?? {}
  const base = {
    snapshotId,
    stateVersion: input.stateVersion,
    session: input.session,
    contextStack:
      input.contextStack ??
      (input.page
        ? [
            {
              type: "page" as const,
              id: input.page.id,
              title: input.page.title,
            },
          ]
        : []),
    page: input.page,
    focus: input.focus,
    recentEvents: input.recentEvents ?? [],
    actionSpecs,
  }

  const objects = input.page
    ? [input.page, ...input.visibleObjects.filter((object) => object.id !== input.page?.id)]
    : input.visibleObjects

  return {
    ...base,
    visibleObjects: attachDomainActions(objects, actionSpecs, {
      ...base,
    }),
  }
}

export function compactSnapshotForIntent(snapshot: InteractionSnapshot): InteractionSnapshot {
  return {
    ...snapshot,
    visibleObjects: snapshot.visibleObjects.map((object) => ({
      id: object.id,
      type: object.type,
      role: object.role,
      label: object.label,
      aliases: object.aliases,
      parent: object.parent,
      entity: object.entity,
      state: object.state,
      actions: object.actions,
      primitiveActions: object.actions?.length ? undefined : object.primitiveActions,
      options: object.options,
    })),
  }
}

export function createLlmSnapshotContext(
  snapshot: InteractionSnapshot,
  options: LlmSnapshotContextOptions = {}
): LlmSnapshotContext {
  const maxObjects = Math.max(0, options.maxObjects ?? 80)
  const visibleObjects = snapshot.visibleObjects.slice(0, maxObjects).map(summarizeObjectForLlm)
  const pageObject = snapshot.page
    ? snapshot.visibleObjects.find((object) => object.id === snapshot.page?.id) ?? snapshot.page
    : undefined

  return {
    snapshotId: snapshot.snapshotId,
    stateVersion: snapshot.stateVersion,
    session: snapshot.session,
    contextStack: snapshot.contextStack,
    page: pageObject ? summarizeObjectForLlm(pageObject) : undefined,
    focus: snapshot.focus,
    recentEvents: options.includeRecentEvents ? snapshot.recentEvents : undefined,
    visibleObjects,
    objectCount: snapshot.visibleObjects.length,
    omittedObjectCount: Math.max(0, snapshot.visibleObjects.length - visibleObjects.length),
    actions: Object.values(snapshot.actionSpecs).map((spec) => ({
      id: spec.id,
      namespace: spec.namespace,
      attachTo: spec.attachTo,
      executeScope: spec.executeScope,
      risk: spec.risk,
      requiresConfirmation: spec.requiresConfirmation,
    })),
  }
}

function summarizeObjectForLlm(object: InteractionObject): LlmSnapshotContextObject {
  return {
    id: object.id,
    type: object.type,
    role: object.role,
    label: object.label,
    aliases: object.aliases,
    title: object.type === "page" ? (object as PageObject).title : undefined,
    route: object.type === "page" ? (object as PageObject).route : undefined,
    parent: object.parent,
    children: object.children,
    primaryControl: object.primaryControl,
    entity: object.entity,
    state: sanitizeJsonValue(object.state) as InteractionState | undefined,
    actions: object.actions,
    primitiveActions: object.actions?.length ? undefined : object.primitiveActions,
    options: object.options,
  }
}

function sanitizeJsonValue(value: unknown, seen = new WeakSet<object>()): unknown {
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
      .map((item) => sanitizeJsonValue(item, seen))
      .filter((item) => typeof item !== "undefined")
  }
  if (typeof value === "object") {
    if (seen.has(value)) return undefined
    seen.add(value)
    const output: Record<string, unknown> = {}
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      const sanitized = sanitizeJsonValue(item, seen)
      if (typeof sanitized !== "undefined") output[key] = sanitized
    })
    seen.delete(value)
    return output
  }
  return undefined
}
