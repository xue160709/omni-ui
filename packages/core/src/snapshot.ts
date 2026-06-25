import { attachDomainActions } from "./action-registry"
import { createUnifiedFocus, deriveActiveContext, projectLegacyFocus, type UnifiedFocus } from "./focus"
import {
  createLlmManifestContext,
  createManifestObjects,
  type AppInteractionManifest,
  type LlmInteractionManifest,
} from "./manifest"
import { projectSnapshotForModel, redactInteractionState } from "./privacy"
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

// 中文：snapshot id 只需要在当前 runtime 生命周期内递增，便于调试和模型上下文引用。
// English: Snapshot ids only need to increment within the current runtime lifetime for debugging and model context references.
let snapshotCounter = 0

export type CreateSnapshotInput = {
  stateVersion: number
  manifest?: AppInteractionManifest
  page?: PageObject
  contextStack?: ContextObject[]
  visibleObjects: InteractionObject[]
  focus?: FocusInfo
  unifiedFocus?: UnifiedFocus
  focusRevision?: number
  eventSequence?: number
  contextHash?: string
  recentEvents?: InteractionEvent[]
  actionSpecs?: Record<string, RegisteredActionSpec>
  session?: InteractionSnapshot["session"]
}

export type LlmSnapshotContextOptions = {
  maxObjects?: number
  includeRecentEvents?: boolean
  allowedActionIds?: string[]
  enforceModelCallable?: boolean
  includePrimitiveActions?: boolean
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
  manifest?: LlmInteractionManifest
}

// 中文：创建完整交互快照：合并页面、manifest 对象、运行时对象，并附加当前可用业务 action。
// English: Creates the full interaction snapshot by merging page, manifest objects, runtime objects, and available domain actions.
export function createInteractionSnapshot(input: CreateSnapshotInput): InteractionSnapshot {
  const snapshotId = `snapshot_${++snapshotCounter}`
  const actionSpecs = input.actionSpecs ?? {}
  const contextStack =
    input.contextStack ??
    (input.page
      ? [
          {
            type: "page" as const,
            id: input.page.id,
            title: input.page.title,
          },
        ]
      : [])
  const unifiedFocus =
    input.unifiedFocus ??
    createUnifiedFocus({
      activeContext: deriveActiveContext(contextStack),
      inputFocus: input.focus
        ? {
            objectId: input.focus.objectId,
            source:
              input.focus.source === "voice" || input.focus.source === "gui"
                ? input.focus.source
                : "programmatic",
            confidence: input.focus.confidence ?? 1,
            timestamp: Date.now(),
          }
        : undefined,
      revision: input.focusRevision ?? 0,
    })
  const recentEvents = input.recentEvents ?? []
  const focusRevision = input.focusRevision ?? unifiedFocus.revision
  const eventSequence =
    input.eventSequence ??
    recentEvents.reduce((max, event) => Math.max(max, event.sequence ?? 0), 0)
  const base = {
    snapshotId,
    stateVersion: input.stateVersion,
    contextHash:
      input.contextHash ??
      createSnapshotContextHash({
        contextStack,
        pageId: input.page?.id,
        activeContextId: unifiedFocus.activeContext?.id,
      }),
    focusRevision,
    eventSequence,
    session: input.session,
    contextStack,
    page: input.page,
    manifest: input.manifest,
    focus: input.focus ?? projectLegacyFocus(unifiedFocus),
    unifiedFocus,
    recentEvents,
    actionSpecs,
  }

  const manifestObjects = createManifestObjects(input.manifest)
  const objects = dedupeObjects(
    input.page
      ? [
          input.page,
          ...manifestObjects.filter((object) => object.id !== input.page?.id),
          ...input.visibleObjects.filter((object) => object.id !== input.page?.id),
        ]
      : [...manifestObjects, ...input.visibleObjects]
  )

  return {
    ...base,
    visibleObjects: attachDomainActions(objects, actionSpecs, {
      ...base,
    }),
  }
}

export function compactSnapshotForIntent(snapshot: InteractionSnapshot): InteractionSnapshot {
  // 中文：本地/LLM 意图解析只需要对象身份、标签、状态和动作，不需要完整页面元数据。
  // English: Intent resolution needs object identity, labels, state, and actions rather than full page metadata.
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
  // 中文：限制对象数量可以让 prompt 稳定可控，同时显式告诉模型还有多少对象被省略。
  // English: Limiting object count keeps prompts bounded while explicitly reporting how many objects were omitted.
  const maxObjects = Math.max(0, options.maxObjects ?? 80)
  const projected = projectSnapshotForModel(snapshot, {
    maxObjects,
    includeRecentEvents: options.includeRecentEvents,
    includePrimitiveActions: options.includePrimitiveActions,
    allowedActionIds: options.allowedActionIds,
    enforceModelCallable: options.enforceModelCallable ?? false,
  })
  const visibleObjects = projected.visibleObjects.map(summarizeObjectForLlm)
  const pageObject = projected.page
    ? projected.visibleObjects.find((object) => object.id === projected.page?.id) ?? projected.page
    : undefined

  return {
    snapshotId: projected.snapshotId,
    stateVersion: projected.stateVersion,
    session: projected.session,
    contextStack: projected.contextStack,
    page: pageObject ? summarizeObjectForLlm(pageObject) : undefined,
    focus: projected.focus,
    recentEvents: options.includeRecentEvents ? projected.recentEvents : undefined,
    visibleObjects,
    objectCount: snapshot.visibleObjects.length,
    omittedObjectCount: Math.max(0, snapshot.visibleObjects.length - visibleObjects.length),
    actions: Object.values(projected.actionSpecs).map((spec) => ({
      id: spec.id,
      namespace: spec.namespace,
      attachTo: spec.attachTo,
      executeScope: spec.executeScope,
      risk: spec.risk,
      requiresConfirmation: spec.requiresConfirmation,
    })),
    manifest: createLlmManifestContext(projected.manifest),
  }
}

function dedupeObjects(objects: InteractionObject[]): InteractionObject[] {
  // 中文：Map 保留最后一次写入，让更靠后的来源覆盖同 id 对象。
  // English: Map keeps the last write, allowing later sources to override objects with the same id.
  const byId = new Map<string, InteractionObject>()
  objects.forEach((object) => byId.set(object.id, object))
  return Array.from(byId.values())
}

function summarizeObjectForLlm(object: InteractionObject): LlmSnapshotContextObject {
  // 中文：LLM 视图会隐藏已被业务 action 覆盖的 primitiveActions，减少模型误用底层 DOM 操作。
  // English: The LLM view hides primitiveActions when domain actions exist to reduce accidental low-level DOM dispatch.
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
    state: redactInteractionState(object.state) as InteractionState | undefined,
    actions: object.actions,
    primitiveActions: object.actions?.length ? undefined : object.primitiveActions,
    options: object.options,
  }
}

function createSnapshotContextHash(value: unknown): string {
  const encoded = JSON.stringify(value)
  let hash = 2166136261
  for (let index = 0; index < encoded.length; index += 1) {
    hash ^= encoded.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function sanitizeJsonValue(value: unknown, seen = new WeakSet<object>()): unknown {
  // 中文：snapshot state 需要安全 JSON 化，避免循环引用或运行时对象污染模型上下文。
  // English: Snapshot state must be JSON-safe so cycles or runtime objects do not leak into model context.
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
