import type {
  IntentResolver,
  InteractionObject,
  InteractionSnapshot,
  PrimitiveAction,
  ResolvedInteraction,
} from "./types"

export type LocalRuleTarget =
  | "route.byLabel"
  | "object.byLabel"
  | "object.byLabelOrIndex"
  | "object.byIndex"
  | "page.current"
  | `entity.${string}.byLabel`
  | `entity.${string}.byIndex`
  | `entity.${string}.byLabelOrIndex`
  | {
      kind: "route"
      slot?: string
    }
  | {
      kind: "object"
      slot?: string
      role?: string
      by?: "label" | "index" | "labelOrIndex"
    }
  | {
      kind: "entity"
      entityType: string
      slot?: string
      by?: "label" | "index" | "labelOrIndex"
    }
  | {
      kind: "page"
    }

export type LocalInteractionRule = {
  id?: string
  intent?: string
  patterns: string[]
  target: LocalRuleTarget
  actionId?: string
  primitiveAction?: PrimitiveAction
  params?: Record<string, string | number | boolean | null>
  confidence?: number
}

export type ConfiguredRuleResolverOptions = {
  id?: string
  rules: LocalInteractionRule[]
}

type PatternMatch = {
  values: Record<string, string>
  text: string
}

export function createConfiguredRuleResolver(
  options: ConfiguredRuleResolverOptions
): IntentResolver {
  return {
    id: options.id ?? "configured-rule",
    resolve({ utterance, snapshot }) {
      for (const rule of options.rules) {
        const match = matchRulePatterns(utterance, rule.patterns)
        if (!match) continue

        const target = resolveRuleTarget(snapshot, rule.target, match)
        if (!target) {
          return {
            status: "not_found",
            utterance,
            intent: rule.intent ?? rule.id,
            confidence: 0,
            reason: `No target matched configured rule${rule.id ? ` ${rule.id}` : ""}.`,
            resolverId: options.id ?? "configured-rule",
          }
        }

        return {
          status: "resolved",
          utterance,
          intent: rule.intent ?? rule.id,
          targetId: target.id,
          actionId: rule.actionId,
          primitiveAction: rule.primitiveAction,
          params: resolveRuleParams(rule.params, match),
          confidence: rule.confidence ?? 0.92,
          reason: rule.id ? `configured_rule:${rule.id}` : "configured_rule",
          resolverId: options.id ?? "configured-rule",
        }
      }

      return {
        status: "not_found",
        utterance,
        confidence: 0,
        reason: "No configured rule matched.",
        resolverId: options.id ?? "configured-rule",
      }
    },
  }
}

function matchRulePatterns(utterance: string, patterns: string[]): PatternMatch | undefined {
  const text = utterance.trim()

  for (const pattern of patterns) {
    const regex = compilePattern(pattern)
    const match = text.match(regex)
    if (!match) continue

    return {
      text,
      values: Object.fromEntries(
        Object.entries(match.groups ?? {}).map(([key, value]) => [key, value.trim()])
      ),
    }
  }

  return undefined
}

function compilePattern(pattern: string): RegExp {
  let source = "^"
  let cursor = 0
  const placeholder = /\{([a-zA-Z_][\w-]*)\}/g
  let match: RegExpExecArray | null

  while ((match = placeholder.exec(pattern))) {
    source += escapeRegExp(pattern.slice(cursor, match.index))
    source += `(?<${match[1]}>.+?)`
    cursor = match.index + match[0].length
  }

  source += escapeRegExp(pattern.slice(cursor))
  source += "$"
  return new RegExp(source, "i")
}

function resolveRuleTarget(
  snapshot: InteractionSnapshot,
  target: LocalRuleTarget,
  match: PatternMatch
): InteractionObject | undefined {
  if (target === "page.current" || (typeof target === "object" && target.kind === "page")) {
    return snapshot.page
  }

  if (typeof target === "string") {
    if (target === "route.byLabel") {
      return findObjectByName(snapshot, readSlot(match, "route"), { role: "route" })
    }

    if (target === "object.byLabel") {
      return findObjectByName(snapshot, readSlot(match))
    }

    if (target === "object.byIndex") {
      return findObjectByIndex(snapshot, readOrdinal(match))
    }

    if (target === "object.byLabelOrIndex") {
      return findObjectByIndex(snapshot, readOrdinal(match)) ?? findObjectByName(snapshot, readSlot(match))
    }

    const entityTarget = target.match(/^entity\.(.+)\.by(Label|Index|LabelOrIndex)$/)
    if (entityTarget) {
      const entityType = entityTarget[1]
      const by = entityTarget[2]
      if (by === "Index") return findObjectByIndex(snapshot, readOrdinal(match), { entityType })
      if (by === "Label") return findObjectByName(snapshot, readSlot(match), { entityType })
      return (
        findObjectByIndex(snapshot, readOrdinal(match), { entityType }) ??
        findObjectByName(snapshot, readSlot(match), { entityType })
      )
    }

    return undefined
  }

  if (target.kind === "route") {
    return findObjectByName(snapshot, readSlot(match, target.slot ?? "route"), { role: "route" })
  }

  if (target.kind === "entity") {
    const by = target.by ?? "labelOrIndex"
    const ordinal = readOrdinal(match, target.slot)
    const label = readSlot(match, target.slot)
    if (by === "index") return findObjectByIndex(snapshot, ordinal, { entityType: target.entityType })
    if (by === "label") return findObjectByName(snapshot, label, { entityType: target.entityType })
    return (
      findObjectByIndex(snapshot, ordinal, { entityType: target.entityType }) ??
      findObjectByName(snapshot, label, { entityType: target.entityType })
    )
  }

  const by = target.by ?? "labelOrIndex"
  const ordinal = readOrdinal(match, target.slot)
  const label = readSlot(match, target.slot)
  if (by === "index") return findObjectByIndex(snapshot, ordinal, { role: target.role })
  if (by === "label") return findObjectByName(snapshot, label, { role: target.role })
  return (
    findObjectByIndex(snapshot, ordinal, { role: target.role }) ??
    findObjectByName(snapshot, label, { role: target.role })
  )
}

function findObjectByName(
  snapshot: InteractionSnapshot,
  text: string,
  filter: { role?: string; entityType?: string } = {}
): InteractionObject | undefined {
  const query = normalizeSpeech(text)
  if (!query) return undefined

  const objects = snapshot.visibleObjects.filter((object) => {
    if (object.type === "page") return false
    if (filter.role && object.role !== filter.role) return false
    if (filter.entityType && object.entity?.type !== filter.entityType) return false
    return true
  })

  return (
    objects.find((object) =>
      getObjectNames(object).some((name) => normalizeSpeech(name) === query)
    ) ??
    objects.find((object) =>
      getObjectNames(object).some((name) => {
        const normalized = normalizeSpeech(name)
        return normalized.includes(query) || query.includes(normalized)
      })
    )
  )
}

function findObjectByIndex(
  snapshot: InteractionSnapshot,
  ordinal: number | undefined,
  filter: { role?: string; entityType?: string } = {}
): InteractionObject | undefined {
  if (!ordinal) return undefined

  return snapshot.visibleObjects
    .filter((object) => {
      if (filter.role && object.role !== filter.role) return false
      if (filter.entityType && object.entity?.type !== filter.entityType) return false
      return object.role === "list_item" || object.type === "composite"
    })
    .sort((a, b) => Number(a.state?.index ?? 9999) - Number(b.state?.index ?? 9999))
    .find((object) => object.state?.index === ordinal)
}

function resolveRuleParams(
  params: LocalInteractionRule["params"],
  match: PatternMatch
): Record<string, unknown> | undefined {
  if (!params) return undefined

  const output: Record<string, unknown> = {}
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === "string" && value.startsWith("$")) {
      output[key] = match.values[value.slice(1)] ?? ""
      return
    }
    output[key] = value
  })
  return output
}

function readSlot(match: PatternMatch, preferred?: string): string {
  if (preferred && match.values[preferred]) return match.values[preferred]
  return (
    match.values.target ??
    match.values.item ??
    match.values.object ??
    match.values.entity ??
    match.values.route ??
    match.values.name ??
    match.text
  )
}

function readOrdinal(match: PatternMatch, preferred?: string): number | undefined {
  const value = readSlot(match, preferred)
  return extractOrdinal(value) ?? extractOrdinal(match.text)
}

function extractOrdinal(text: string): number | undefined {
  const digitMatch = text.match(/第\s*(\d+)\s*(个|项|条|行)?/)
  if (digitMatch) return Number(digitMatch[1])

  const ordinalWords: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  }
  const wordMatch = text.match(/第\s*([一二两三四五六七八九十])\s*(个|项|条|行)?/)
  return wordMatch ? ordinalWords[wordMatch[1]] : undefined
}

function getObjectNames(object: InteractionObject): string[] {
  return [object.label, ...(object.aliases ?? [])].filter(Boolean) as string[]
}

function normalizeSpeech(value: string): string {
  return value
    .toLowerCase()
    .replace(/[，。！？、,.!?:：；;\s"'“”‘’]/g, "")
    .replace(/^这个/, "")
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
