import {
  isTerminalTurnStatus,
  transitionTurn,
  type InteractionTurn,
  type TurnEvent,
} from "./turn"

export type TurnMutationResult =
  | { ok: true; turn: InteractionTurn }
  | {
      ok: false
      reason: "turn_missing" | "revision_conflict" | "terminal_turn" | "illegal_event"
    }

export type InteractionTurnStoreOptions = {
  maxRetainedTurns?: number
  now?: () => number
}

export interface InteractionTurnStore {
  create(turn: InteractionTurn, options?: { active?: boolean }): void
  get(turnId: string): InteractionTurn | undefined
  getActive(): InteractionTurn | undefined
  list(): InteractionTurn[]
  apply(turnId: string, expectedRevision: number, event: TurnEvent): TurnMutationResult
  clearActive(turnId?: string): void
}

export function createInteractionTurnStore(
  options: InteractionTurnStoreOptions = {}
): InteractionTurnStore {
  return new MemoryInteractionTurnStore(options)
}

class MemoryInteractionTurnStore implements InteractionTurnStore {
  private readonly turns = new Map<string, InteractionTurn>()
  private readonly order: string[] = []
  private readonly maxRetainedTurns: number
  private activeTurnId: string | undefined

  constructor(options: InteractionTurnStoreOptions) {
    this.maxRetainedTurns = Math.max(1, options.maxRetainedTurns ?? 50)
  }

  create(turn: InteractionTurn, options: { active?: boolean } = {}): void {
    if (!this.turns.has(turn.id)) this.order.push(turn.id)
    this.turns.set(turn.id, turn)
    if (options.active ?? !isTerminalTurnStatus(turn.status)) {
      this.activeTurnId = turn.id
    }
    this.prune()
  }

  get(turnId: string): InteractionTurn | undefined {
    return this.turns.get(turnId)
  }

  getActive(): InteractionTurn | undefined {
    if (!this.activeTurnId) return undefined
    const turn = this.turns.get(this.activeTurnId)
    if (!turn || isTerminalTurnStatus(turn.status)) {
      this.activeTurnId = undefined
      return undefined
    }
    return turn
  }

  list(): InteractionTurn[] {
    return this.order
      .map((turnId) => this.turns.get(turnId))
      .filter((turn): turn is InteractionTurn => Boolean(turn))
  }

  apply(turnId: string, expectedRevision: number, event: TurnEvent): TurnMutationResult {
    const turn = this.turns.get(turnId)
    if (!turn) return { ok: false, reason: "turn_missing" }
    if (turn.revision !== expectedRevision) return { ok: false, reason: "revision_conflict" }
    if (isTerminalTurnStatus(turn.status)) return { ok: false, reason: "terminal_turn" }

    try {
      const next = transitionTurn(turn, event)
      this.turns.set(turnId, next)
      if (this.activeTurnId === turnId && isTerminalTurnStatus(next.status)) {
        this.activeTurnId = undefined
      }
      return { ok: true, turn: next }
    } catch {
      return { ok: false, reason: "illegal_event" }
    }
  }

  clearActive(turnId?: string): void {
    if (!turnId || this.activeTurnId === turnId) {
      this.activeTurnId = undefined
    }
  }

  private prune(): void {
    while (this.order.length > this.maxRetainedTurns) {
      const oldest = this.order.shift()
      if (!oldest) return
      this.turns.delete(oldest)
      if (this.activeTurnId === oldest) this.activeTurnId = undefined
    }
  }
}
