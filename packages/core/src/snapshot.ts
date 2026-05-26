import { attachDomainActions } from "./action-registry"
import {
  createLlmManifestContext,
  createManifestObjects,
  type AppInteractionManifest,
  type LlmInteractionManifest,
} from "./manifest"
import type {
  ContextObject,
  EntityRef,
  ExecuteScope,
  FocusInfo,
  InteractionBounds,
  InteractionEvent,
  InteractionHitTarget,
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
  recentReferences?: InteractionSnapshot["recentReferences"]
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
  bounds?: InteractionBounds
  hitTarget?: InteractionHitTarget
  semanticKind?: InteractionObject["semanticKind"]
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
  recentReferences?: InteractionSnapshot["recentReferences"]
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
    manifest: input.manifest,
    focus: input.focus,
    recentReferences: input.recentReferences ?? [],
    recentEvents: input.recentEvents ?? [],
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
      bounds: object.bounds,
      hitTarget: object.hitTarget,
      semanticKind: object.semanticKind,
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
    recentReferences: snapshot.recentReferences,
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
    manifest: createLlmManifestContext(snapshot.manifest),
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
    bounds: object.bounds,
    hitTarget: object.hitTarget,
    semanticKind: object.semanticKind,
    entity: object.entity,
    state: sanitizeJsonValue(object.state) as InteractionState | undefined,
    actions: object.actions,
    primitiveActions: object.actions?.length ? undefined : object.primitiveActions,
    options: object.options,
  }
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
