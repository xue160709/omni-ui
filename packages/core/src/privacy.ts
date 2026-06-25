import type {
  InteractionEvent,
  InteractionObject,
  InteractionSnapshot,
  RegisteredActionSpec,
} from "./types"

export type ModelSnapshotProjectionOptions = {
  maxObjects?: number
  includeRecentEvents?: boolean
  includePrimitiveActions?: boolean
  allowedActionIds?: string[]
  enforceModelCallable?: boolean
}

export function projectSnapshotForModel(
  snapshot: InteractionSnapshot,
  options: ModelSnapshotProjectionOptions = {}
): InteractionSnapshot {
  const allowedActionIds = new Set(options.allowedActionIds ?? [])
  const enforceModelCallable = options.enforceModelCallable ?? true
  const actionSpecs = Object.fromEntries(
    Object.entries(snapshot.actionSpecs).filter(([id, spec]) => {
      if (enforceModelCallable && spec.modelCallable !== true) return false
      if (allowedActionIds.size === 0) return true
      return allowedActionIds.has(id) || [...allowedActionIds].some((item) => item.endsWith("*") && id.startsWith(item.slice(0, -1)))
    })
  ) as Record<string, RegisteredActionSpec>
  const actionIds = new Set(Object.keys(actionSpecs))
  const sortedObjects = sortObjectsForModel(snapshot)
  const maxObjects = Math.max(0, options.maxObjects ?? sortedObjects.length)

  return {
    ...snapshot,
    actionSpecs,
    recentEvents: options.includeRecentEvents
      ? snapshot.recentEvents.map(redactInteractionEvent)
      : [],
    visibleObjects: sortedObjects.slice(0, maxObjects).map((object) =>
      redactInteractionObjectForModel(object, actionIds, {
        includePrimitiveActions: options.includePrimitiveActions,
      })
    ),
  }
}

export function redactInteractionObjectForModel(
  object: InteractionObject,
  allowedActionIds: Set<string> = new Set(object.actions ?? []),
  options: { includePrimitiveActions?: boolean } = {}
): InteractionObject {
  return {
    ...object,
    state: redactInteractionState(object.state),
    actions: object.actions?.filter((actionId) => allowedActionIds.has(actionId)),
    primitiveActions: options.includePrimitiveActions ? object.primitiveActions : undefined,
  }
}

export function redactInteractionState(value: unknown): Record<string, unknown> | undefined {
  const redacted = redactJsonValue(value, "$")
  return redacted && typeof redacted === "object" && !Array.isArray(redacted)
    ? (redacted as Record<string, unknown>)
    : undefined
}

export function redactInteractionEvent(event: InteractionEvent): InteractionEvent {
  return {
    ...event,
    text: event.modality === "voice" ? redactText(event.text) : event.text,
    value: redactJsonValue(event.value, "value"),
  }
}

export function redactText(text: string | undefined): string | undefined {
  if (!text) return text
  if (looksSensitive(text)) return "[redacted]"
  return text
}

export function isSensitiveFieldName(name: string): boolean {
  return /password|passcode|otp|token|api[_-]?key|secret|card|cvv|authorization|cookie/i.test(name)
}

export function looksSensitive(value: string): boolean {
  return (
    /(?:sk|pk|api|token|secret)[_-]?[a-z0-9]{12,}/i.test(value) ||
    /\b\d{3,4}\b/.test(value) && /otp|code|验证码|动态码/i.test(value)
  )
}

function sortObjectsForModel(snapshot: InteractionSnapshot): InteractionObject[] {
  const selected = new Set(snapshot.unifiedFocus.selectedObjectIds)
  const recent = new Map(
    snapshot.unifiedFocus.recentTargets.map((target, index) => [target.objectId, index])
  )
  const semantic = snapshot.unifiedFocus.semanticFocus?.objectId
  const input = snapshot.unifiedFocus.inputFocus?.objectId
  const activeContext = snapshot.unifiedFocus.activeContext?.id

  return [...snapshot.visibleObjects].sort((a, b) => score(b) - score(a))

  function score(object: InteractionObject): number {
    let value = 0
    if (object.id === activeContext || object.parent === activeContext) value += 100
    if (selected.has(object.id)) value += 80
    if (object.id === semantic) value += 70
    if (object.id === input) value += 50
    if (recent.has(object.id)) value += 40 - (recent.get(object.id) ?? 0)
    if (object.type === "page") value += 10
    return value
  }
}

function redactJsonValue(value: unknown, path: string, seen = new WeakSet<object>()): unknown {
  const key = path.split(".").at(-1) ?? path
  if (isSensitiveFieldName(key)) return "[redacted]"

  if (value == null) return value
  if (typeof value === "string") return looksSensitive(value) ? "[redacted]" : value
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (typeof value === "boolean") return value
  if (typeof value === "bigint") return value.toString()
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "undefined") return undefined
  if (value instanceof Date) return value.toISOString()

  if (Array.isArray(value)) {
    if (seen.has(value)) return undefined
    seen.add(value)
    const output = value
      .map((item, index) => redactJsonValue(item, `${path}.${index}`, seen))
      .filter((item) => typeof item !== "undefined")
    seen.delete(value)
    return output
  }

  if (typeof value === "object") {
    if (seen.has(value)) return undefined
    seen.add(value)
    const record = value as Record<string, unknown>

    if (isInputState(record)) {
      return {
        hasValue: typeof record.value === "string" ? record.value.length > 0 : Boolean(record.value),
        length: typeof record.value === "string" ? record.value.length : undefined,
        inputType: typeof record.inputType === "string" ? record.inputType : undefined,
        required: typeof record.required === "boolean" ? record.required : undefined,
        invalid: typeof record.invalid === "boolean" ? record.invalid : undefined,
      }
    }

    const output: Record<string, unknown> = {}
    Object.entries(record).forEach(([itemKey, item]) => {
      const redacted = redactJsonValue(item, `${path}.${itemKey}`, seen)
      if (typeof redacted !== "undefined") output[itemKey] = redacted
    })
    seen.delete(value)
    return output
  }

  return undefined
}

function isInputState(value: Record<string, unknown>): boolean {
  return (
    "value" in value &&
    (typeof value.inputType === "string" ||
      typeof value.required === "boolean" ||
      typeof value.invalid === "boolean" ||
      typeof value.hasValue === "boolean")
  )
}
