import type { InteractionEvent } from "./types"

export type InteractionEventType =
  | "gui.pointer.activated"
  | "gui.focus.changed"
  | "gui.selection.changed"
  | "gui.input.changed"
  | "gui.dialog.opened"
  | "gui.dialog.closed"
  | "gui.navigation.changed"
  | "voice.asr.partial"
  | "voice.asr.final"
  | "voice.intent.hypothesized"
  | "voice.clarification.requested"
  | "voice.confirmation.received"
  | "fusion.completed"
  | "turn.created"
  | "turn.superseded"
  | "turn.cancelled"
  | "action.validation.started"
  | "action.validated"
  | "action.rejected"
  | "action.execution.started"
  | "action.committed"
  | "action.unverified"
  | "action.pending"
  | "action.noop"
  | "action.verification.started"
  | "action.verification.passed"
  | "action.verification.failed"
  | "action.failed"

export type InteractionEventBufferOptions = {
  capacity?: number
  ttlMs?: number
  snapshotLimit?: number
}

export type InteractionEventInput = Omit<
  InteractionEvent,
  "id" | "sequence" | "timestamp" | "snapshotId" | "baseStateVersion"
> &
  Partial<Pick<InteractionEvent, "id" | "timestamp" | "snapshotId" | "baseStateVersion">>

export interface InteractionEventBuffer {
  append(event: InteractionEventInput | InteractionEvent): void
  list(now?: number): InteractionEvent[]
  recent(limit?: number, now?: number): InteractionEvent[]
  clear(): void
  readonly sequence: number
}

export function createInteractionEventBuffer(
  options: InteractionEventBufferOptions = {}
): InteractionEventBuffer {
  return new RingInteractionEventBuffer(options)
}

export function sanitizeEventValue(value: unknown): unknown {
  if (typeof value === "string") {
    return {
      hasValue: value.length > 0,
      length: value.length,
    }
  }

  if (!value || typeof value !== "object") return value

  const input = value as Record<string, unknown>
  if ("value" in input || "text" in input) {
    const raw =
      typeof input.value === "string"
        ? input.value
        : typeof input.text === "string"
          ? input.text
          : ""
    return {
      hasValue: raw.length > 0,
      length: raw.length,
      inputType: typeof input.inputType === "string" ? input.inputType : undefined,
      required: typeof input.required === "boolean" ? input.required : undefined,
      invalid: typeof input.invalid === "boolean" ? input.invalid : undefined,
    }
  }

  return value
}

class RingInteractionEventBuffer implements InteractionEventBuffer {
  private readonly capacity: number
  private readonly ttlMs: number
  private events: InteractionEvent[] = []
  private nextSequence = 0

  constructor(options: InteractionEventBufferOptions) {
    this.capacity = Math.max(1, options.capacity ?? 100)
    this.ttlMs = Math.max(0, options.ttlMs ?? 30_000)
  }

  get sequence(): number {
    return this.nextSequence
  }

  append(event: InteractionEventInput | InteractionEvent): void {
    const timestamp = event.timestamp ?? Date.now()
    const sequence =
      typeof (event as InteractionEvent).sequence === "number"
        ? (event as InteractionEvent).sequence
        : ++this.nextSequence

    const normalized: InteractionEvent = {
      id: event.id ?? `event_${sequence}`,
      sequence,
      modality: event.modality,
      type: event.type,
      turnId: event.turnId,
      commandId: event.commandId,
      contextEpoch: event.contextEpoch,
      text: event.text,
      target: event.target,
      targetHint: event.targetHint,
      action: event.action,
      snapshotId: event.snapshotId ?? "unknown",
      baseStateVersion: event.baseStateVersion ?? 0,
      timestamp,
      confidence: event.confidence,
      value: sanitizeEventValue(event.value),
    }

    this.events.push(normalized)
    this.prune(timestamp)

    if (this.events.length > this.capacity) {
      this.events = this.events.slice(this.events.length - this.capacity)
    }
  }

  list(now = Date.now()): InteractionEvent[] {
    this.prune(now)
    return [...this.events].sort(compareEvents)
  }

  recent(limit = this.capacity, now = Date.now()): InteractionEvent[] {
    return this.list(now).slice(-Math.max(0, limit)).reverse()
  }

  clear(): void {
    this.events = []
  }

  private prune(now: number): void {
    if (this.ttlMs === 0) return
    const earliest = now - this.ttlMs
    this.events = this.events.filter((event) => event.timestamp >= earliest)
  }
}

function compareEvents(a: InteractionEvent, b: InteractionEvent): number {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp
  return (a.sequence ?? 0) - (b.sequence ?? 0)
}
