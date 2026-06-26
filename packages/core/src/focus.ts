import type {
  ContextObject,
  FocusInfo,
  InteractionEvent,
  InteractionObject,
  InteractionSnapshot,
} from "./types"

export type FocusTarget = {
  objectId: string
  source: FocusInfo["source"]
  confidence: number
  timestamp: number
  expiresAt?: number
}

export type UnifiedFocus = {
  activeContext?: {
    type: "page" | "modal" | "container" | "task"
    id: string
  }
  inputFocus?: FocusTarget
  semanticFocus?: FocusTarget
  selectedObjectIds: string[]
  recentTargets: FocusTarget[]
  revision: number
}

export type FocusOptions = {
  source?: FocusTarget["source"]
  confidence?: number
  timestamp?: number
  ttlMs?: number
}

export type FocusReducerOptions = {
  semanticTtlMs?: number
  recentLimit?: number
  now?: number
}

export function createUnifiedFocus(input: Partial<UnifiedFocus> = {}): UnifiedFocus {
  return {
    activeContext: input.activeContext,
    inputFocus: input.inputFocus,
    semanticFocus: input.semanticFocus,
    selectedObjectIds: input.selectedObjectIds ?? [],
    recentTargets: input.recentTargets ?? [],
    revision: input.revision ?? 0,
  }
}

export function createFocusTarget(
  objectId: string,
  options: FocusOptions = {}
): FocusTarget {
  const timestamp = options.timestamp ?? Date.now()
  return {
    objectId,
    source: options.source ?? "programmatic",
    confidence: options.confidence ?? 1,
    timestamp,
    expiresAt: options.ttlMs ? timestamp + options.ttlMs : undefined,
  }
}

export function setSemanticFocus(
  focus: UnifiedFocus,
  objectId: string,
  options: FocusOptions = {}
): UnifiedFocus {
  const target = createFocusTarget(objectId, {
    source: options.source ?? "programmatic",
    confidence: options.confidence,
    timestamp: options.timestamp,
    ttlMs: options.ttlMs ?? 15_000,
  })

  return withRevisionIfChanged(focus, {
    ...focus,
    semanticFocus: target,
    recentTargets: pushRecentTarget(focus.recentTargets, target),
  })
}

export function setInputFocus(
  focus: UnifiedFocus,
  objectId: string | undefined,
  options: FocusOptions = {}
): UnifiedFocus {
  const next = objectId
    ? {
        ...focus,
        inputFocus: createFocusTarget(objectId, {
          source: options.source ?? "gui",
          confidence: options.confidence,
          timestamp: options.timestamp,
          ttlMs: options.ttlMs,
        }),
      }
    : {
        ...focus,
        inputFocus: undefined,
      }

  return withRevisionIfChanged(focus, next)
}

export function setSelectedObjects(
  focus: UnifiedFocus,
  selectedObjectIds: string[]
): UnifiedFocus {
  return withRevisionIfChanged(focus, {
    ...focus,
    selectedObjectIds: Array.from(new Set(selectedObjectIds)),
  })
}

export function setActiveContext(
  focus: UnifiedFocus,
  context: UnifiedFocus["activeContext"]
): UnifiedFocus {
  return withRevisionIfChanged(focus, {
    ...focus,
    activeContext: context,
  })
}

export function deriveActiveContext(
  contextStack: ContextObject[]
): UnifiedFocus["activeContext"] {
  const modal = [...contextStack].reverse().find((context) => context.type === "modal")
  const active = modal ?? contextStack[contextStack.length - 1]
  return active ? { type: active.type, id: active.id } : undefined
}

export function reduceFocusEvent(
  focus: UnifiedFocus,
  event: InteractionEvent,
  snapshot: Pick<InteractionSnapshot, "visibleObjects" | "contextStack">,
  options: FocusReducerOptions = {}
): UnifiedFocus {
  const now = options.now ?? event.timestamp
  let next = pruneUnifiedFocus(focus, snapshot.visibleObjects, now)

  if (event.type === "gui.pointer.activated" && event.target) {
    const target = resolveSemanticPointerTarget(snapshot.visibleObjects, event.target)
    if (target && target.type !== "page") {
      next = setSemanticFocus(next, target.id, {
        source: "gui",
        timestamp: event.timestamp,
        ttlMs: options.semanticTtlMs ?? 15_000,
      })
    }
  }

  if (event.type === "gui.focus.changed") {
    const target = snapshot.visibleObjects.find((object) => object.id === event.target)
    if (target && isInputFocusObject(target)) {
      next = setInputFocus(next, event.target, {
        source: "gui",
        timestamp: event.timestamp,
      })
    }
  }

  if (event.type === "gui.focus.cleared") {
    next = setInputFocus(next, undefined)
  }

  if (event.type === "gui.selection.changed") {
    next = setSelectedObjects(next, event.target ? [event.target] : [])
  }

  if (event.type === "action.committed" && event.target) {
    next = setSemanticFocus(next, event.target, {
      source: focusSourceFromEventModality(event.modality),
      timestamp: event.timestamp,
      ttlMs: options.semanticTtlMs ?? 15_000,
    })
  }

  const activeContext = deriveActiveContext(snapshot.contextStack)
  if (!next.activeContext && activeContext?.type === "page") {
    return {
      ...next,
      activeContext,
    }
  }
  return setActiveContext(next, activeContext)
}

function isInputFocusObject(object: InteractionObject): boolean {
  return ["textbox", "searchbox", "combobox", "select", "slider", "radio", "checkbox"].includes(object.role)
}

function resolveSemanticPointerTarget(
  objects: InteractionObject[],
  targetId: string
): InteractionObject | undefined {
  const target = objects.find((object) => object.id === targetId)
  if (!target) return undefined
  if (target.type !== "raw") return target

  const parent = findSemanticParent(objects, target)
  if (parent) return parent

  return objects.find((object) =>
    object.type !== "raw" &&
    object.type !== "page" &&
    (object.primaryControl === target.id || object.children?.includes(target.id))
  )
}

function findSemanticParent(
  objects: InteractionObject[],
  object: InteractionObject
): InteractionObject | undefined {
  const seen = new Set<string>()
  let current = object

  while (current.parent && !seen.has(current.parent)) {
    seen.add(current.parent)
    const parent = objects.find((candidate) => candidate.id === current.parent)
    if (!parent) return undefined
    if (parent.type !== "raw" && parent.type !== "page") return parent
    current = parent
  }

  return undefined
}

export function pruneUnifiedFocus(
  focus: UnifiedFocus,
  visibleObjects: InteractionObject[],
  now = Date.now()
): UnifiedFocus {
  const visibleIds = new Set(visibleObjects.map((object) => object.id))
  const isAlive = (target?: FocusTarget) =>
    Boolean(target && visibleIds.has(target.objectId) && (!target.expiresAt || target.expiresAt > now))

  const next = {
    ...focus,
    inputFocus: isAlive(focus.inputFocus) ? focus.inputFocus : undefined,
    semanticFocus: isAlive(focus.semanticFocus) ? focus.semanticFocus : undefined,
    selectedObjectIds: focus.selectedObjectIds.filter((id) => visibleIds.has(id)),
    recentTargets: focus.recentTargets.filter(isAlive).slice(0, 8),
  }

  return withRevisionIfChanged(focus, next)
}

function focusSourceFromEventModality(
  modality: InteractionEvent["modality"]
): FocusTarget["source"] {
  if (modality === "text") return "keyboard"
  if (modality === "touch") return "gui"
  if (modality === "remote") return "programmatic"
  return modality
}

export function projectLegacyFocus(focus: UnifiedFocus): FocusInfo | undefined {
  const target = focus.inputFocus ?? focus.semanticFocus
  if (!target) return undefined
  return {
    objectId: target.objectId,
    source: target.source === "programmatic" ? "programmatic" : target.source,
    confidence: target.confidence,
  }
}

function pushRecentTarget(recentTargets: FocusTarget[], target: FocusTarget): FocusTarget[] {
  const filtered = recentTargets.filter((item) => item.objectId !== target.objectId)
  return [target, ...filtered].slice(0, 8)
}

function withRevisionIfChanged(previous: UnifiedFocus, next: UnifiedFocus): UnifiedFocus {
  if (focusEquivalent(previous, next)) return previous
  return {
    ...next,
    revision: previous.revision + 1,
  }
}

function focusEquivalent(a: UnifiedFocus, b: UnifiedFocus): boolean {
  return (
    a.activeContext?.id === b.activeContext?.id &&
    a.activeContext?.type === b.activeContext?.type &&
    a.inputFocus?.objectId === b.inputFocus?.objectId &&
    a.inputFocus?.source === b.inputFocus?.source &&
    a.semanticFocus?.objectId === b.semanticFocus?.objectId &&
    a.semanticFocus?.source === b.semanticFocus?.source &&
    a.selectedObjectIds.join("\0") === b.selectedObjectIds.join("\0") &&
    a.recentTargets.map((target) => `${target.objectId}:${target.source}`).join("\0") ===
      b.recentTargets.map((target) => `${target.objectId}:${target.source}`).join("\0")
  )
}
