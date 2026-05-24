import { createLlmSnapshotContext, type LlmSnapshotContext } from "./snapshot"
import type {
  ActionPayload,
  InteractionSnapshot,
  InteractionSubmitResult,
  ResolvedInteraction,
  RiskLevel,
  ValidationResult,
} from "./types"

export type InteractionAssistantReplyState = "ready" | "error" | string

export type InteractionAssistantReply = {
  content: string
  state?: InteractionAssistantReplyState
}

export type InteractionActionPolicy = {
  mode?: "all" | "allowlist" | "off"
  minConfidence?: number
  allowDomainActions?: boolean
  allowPrimitiveActions?: boolean
  intents?: string[]
  actionIds?: string[]
  primitiveActions?: string[]
  riskLevels?: RiskLevel[]
  requireConfirmationForRisk?: RiskLevel[]
}

export type LocalExecutionPolicy = InteractionActionPolicy

export type ModelActionPolicy = InteractionActionPolicy

export type InteractionActionPolicyContext = {
  snapshot?: InteractionSnapshot
  confirmedActionId?: string
  source?: "local" | "model" | string
}

export type LocalInteractionReplyContext = {
  result: InteractionSubmitResult
  resolution: ResolvedInteraction
  action?: ActionPayload
  actionType?: string
  targetLabel: string
}

export type LocalInteractionReplyFormatter = (
  context: LocalInteractionReplyContext
) => string | InteractionAssistantReply | undefined

export type LocalInteractionReplyOptions = {
  actionReplies?: Record<string, string | LocalInteractionReplyFormatter>
  defaultSuccess?: string | LocalInteractionReplyFormatter
  targetLabel?: (label: string) => string
}

export type InteractionAssistantPromptOptions = {
  role?: string
  instructions?: string[]
  snapshotLabel?: string
}

export type InteractionAssistantModelAction = {
  type: "interaction_action"
  resolution: ResolvedInteraction
  reply?: string
}

export type InteractionAssistantModelBatchAction = {
  type: "interaction_actions"
  resolutions: ResolvedInteraction[]
  reply?: string
}

export type InteractionAssistantModelReply =
  | {
      type: "message"
      content: string
    }
  | InteractionAssistantModelAction
  | InteractionAssistantModelBatchAction

export type CreateAssistantSnapshotContextOptions = {
  maxObjects?: number
  includeRecentEvents?: boolean
}

export function shouldSubmitResolvedInteraction(
  resolution: ResolvedInteraction,
  policy: LocalExecutionPolicy = {}
): boolean {
  return validateResolvedInteractionPolicy(resolution, policy).ok
}

export function validateResolvedInteractionPolicy(
  resolution: ResolvedInteraction,
  policy: InteractionActionPolicy = {},
  context: InteractionActionPolicyContext = {}
): ValidationResult {
  if (policy.mode === "off") {
    return {
      ok: false,
      code: "policy_denied",
      reason: `${formatPolicySource(context.source)}不允许执行该操作`,
    }
  }

  if (resolution.status !== "resolved" || !resolution.targetId) {
    return {
      ok: false,
      code: "target_missing",
      reason: "候选意图没有解析出可执行目标",
    }
  }

  const minConfidence = policy.minConfidence ?? 0.7
  if (resolution.confidence < minConfidence) {
    return {
      ok: false,
      code: "policy_denied",
      reason: `候选意图置信度不足，需要至少 ${minConfidence}`,
    }
  }

  const actionAllowed = Boolean(resolution.actionId && policy.allowDomainActions !== false)
  const primitiveAllowed = Boolean(
    resolution.primitiveAction && policy.allowPrimitiveActions !== false
  )
  if (!actionAllowed && !primitiveAllowed) {
    return {
      ok: false,
      code: "policy_denied",
      reason: resolution.actionId || resolution.primitiveAction
        ? `${formatPolicySource(context.source)}不允许执行该类型的操作`
        : "候选意图没有可执行 action",
    }
  }

  if (policy.mode === "allowlist") {
    const allowed =
      matchesPolicyList(policy.intents, resolution.intent) ||
      matchesPolicyList(policy.actionIds, resolution.actionId) ||
      matchesPolicyList(policy.primitiveActions, resolution.primitiveAction)

    if (!allowed) {
      return {
        ok: false,
        code: "policy_denied",
        reason: `${formatPolicySource(context.source)}未放行该 action`,
      }
    }
  }

  const actionSpec = resolution.actionId
    ? context.snapshot?.actionSpecs[resolution.actionId]
    : undefined
  const risk = actionSpec?.risk

  if (risk && policy.riskLevels?.length && !policy.riskLevels.includes(risk)) {
    return {
      ok: false,
      code: "policy_denied",
      reason: `${formatPolicySource(context.source)}不允许执行 ${risk} 风险操作`,
    }
  }

  if (
    risk &&
    policy.requireConfirmationForRisk?.includes(risk) &&
    context.confirmedActionId !== resolution.actionId
  ) {
    return {
      ok: false,
      code: "confirmation_required",
      reason: "该操作需要确认",
    }
  }

  return { ok: true }
}

export function createAssistantSnapshotContext(
  snapshot: InteractionSnapshot,
  options: CreateAssistantSnapshotContextOptions = {}
): LlmSnapshotContext {
  return createLlmSnapshotContext(snapshot, {
    maxObjects: options.maxObjects,
    includeRecentEvents: options.includeRecentEvents,
  })
}

export function createInteractionAssistantSystemPrompt(
  snapshotContext: LlmSnapshotContext,
  options: InteractionAssistantPromptOptions = {}
): string {
  const role =
    options.role ??
    "你是一个有用的应用助手，回答要简洁、具体，并优先依据当前 Interaction Snapshot。"
  const instructions = options.instructions ?? [
    "你可以读取下方 Interaction Snapshot 中暴露的当前页面、可见对象、业务状态和可执行动作。",
    "用户询问当前页面、对象、数量、状态或筛选时，优先依据 snapshot.page.state 和 visibleObjects 回答。",
    "如果用户要求修改状态或执行页面操作，请返回一个 interaction_action JSON 对象，让应用本地验证并执行；不要只用自然语言承诺已经完成。",
    "interaction_action JSON 格式：{\"type\":\"interaction_action\",\"resolution\":{\"status\":\"resolved\",\"utterance\":\"用户原话\",\"targetId\":\"快照中的对象 id\",\"actionId\":\"快照中的动作 id\",\"params\":{},\"confidence\":0.9},\"reply\":\"执行成功后展示给用户的话\"}。",
    "如果用户要求对多个对象执行同一操作，请返回 interaction_actions JSON 对象，在 resolutions 中逐项列出每个目标；不要只返回一个代表目标。格式：{\"type\":\"interaction_actions\",\"resolutions\":[{\"status\":\"resolved\",\"utterance\":\"用户原话\",\"targetId\":\"对象 id\",\"actionId\":\"动作 id\",\"params\":{},\"confidence\":0.9}],\"reply\":\"执行成功后展示给用户的话\"}。",
    "只使用 Interaction Snapshot 里真实存在的 targetId、actionId 或 primitiveAction；如果目标不明确，直接用自然语言追问。",
    "如果用户询问的信息没有出现在快照里，请明确说明当前上下文没有提供该信息。",
  ]

  return [
    role,
    ...instructions,
    `${options.snapshotLabel ?? "Interaction Snapshot"}:\n${JSON.stringify(snapshotContext, null, 2)}`,
  ].join("\n\n")
}

export function parseInteractionAssistantModelReply(
  content: string,
  fallbackUtterance: string
): InteractionAssistantModelReply {
  const parsed = parseJsonValue(content)
  const reply =
    (parsed ? parseModelReplyValue(parsed, fallbackUtterance) : undefined) ??
    parseToolCall(content, fallbackUtterance)

  if (!reply) {
    return {
      type: "message",
      content,
    }
  }

  return reply
}

function parseModelReplyValue(
  value: unknown,
  fallbackUtterance: string
): InteractionAssistantModelAction | InteractionAssistantModelBatchAction | undefined {
  if (Array.isArray(value)) {
    return createBatchAction(value, fallbackUtterance)
  }

  if (!isRecord(value)) return undefined

  const batchSources = getBatchResolutionSources(value)
  if (batchSources) {
    return createBatchAction(batchSources, fallbackUtterance, value)
  }

  const resolution = normalizeModelResolution(value, fallbackUtterance)
  if (!resolution) return undefined

  return {
    type: "interaction_action",
    resolution,
    reply: typeof value.reply === "string" ? value.reply : undefined,
  }
}

function getBatchResolutionSources(record: Record<string, unknown>): unknown[] | undefined {
  if (Array.isArray(record.resolutions)) return record.resolutions
  if (Array.isArray(record.actions)) return record.actions
  if (Array.isArray(record.interaction_actions)) return record.interaction_actions
  return undefined
}

function createBatchAction(
  sources: unknown[],
  fallbackUtterance: string,
  parent?: Record<string, unknown>
): InteractionAssistantModelBatchAction | undefined {
  const resolutions = sources
    .map((source) => normalizeModelResolution(source, fallbackUtterance))
    .filter((resolution): resolution is ResolvedInteraction => Boolean(resolution))

  if (resolutions.length === 0) return undefined

  return {
    type: "interaction_actions",
    resolutions,
    reply: typeof parent?.reply === "string" ? parent.reply : undefined,
  }
}

function normalizeModelResolution(
  source: unknown,
  fallbackUtterance: string
): ResolvedInteraction | undefined {
  if (!isRecord(source)) return undefined

  const resolutionSource = isRecord(source.resolution) ? source.resolution : source
  const actionId =
    typeof resolutionSource.actionId === "string"
      ? resolutionSource.actionId
      : typeof resolutionSource.action === "string"
        ? resolutionSource.action
        : undefined
  const hasExecutableResolution =
    typeof actionId === "string" ||
    typeof resolutionSource.primitiveAction === "string"

  if (!hasExecutableResolution) return undefined

  const targetId =
    typeof resolutionSource.targetId === "string"
      ? resolutionSource.targetId
      : undefined

  return {
    status: "resolved",
    utterance:
      typeof resolutionSource.utterance === "string"
        ? resolutionSource.utterance
        : fallbackUtterance,
    intent: typeof resolutionSource.intent === "string" ? resolutionSource.intent : undefined,
    targetId,
    actionId,
    primitiveAction:
      typeof resolutionSource.primitiveAction === "string"
        ? resolutionSource.primitiveAction
        : undefined,
    params: isRecord(resolutionSource.params) ? resolutionSource.params : undefined,
    confidence:
      typeof resolutionSource.confidence === "number"
        ? Math.max(0, Math.min(1, resolutionSource.confidence))
        : 0.9,
    reason: typeof resolutionSource.reason === "string" ? resolutionSource.reason : undefined,
    resolverId: "assistant-llm",
  }
}

export function createLocalInteractionReply(
  result: InteractionSubmitResult,
  options: LocalInteractionReplyOptions = {}
): InteractionAssistantReply | undefined {
  const resolution = result.resolution

  if (result.ok && result.executed) {
    const context = createReplyContext(result, options)
    const formatter = context.actionType ? options.actionReplies?.[context.actionType] : undefined
    const reply = formatReply(formatter ?? options.defaultSuccess, context)

    if (reply) return normalizeReply(reply, "ready")

    return {
      content: `已执行：${context.actionType ?? "操作"}。`,
      state: "ready",
    }
  }

  if (resolution.status === "needs_clarification") {
    return {
      content: resolution.reason ?? "我需要你再明确一下要操作哪一项。",
      state: "error",
    }
  }

  if (result.validation && !result.validation.ok) {
    return {
      content: result.validation.reason,
      state: "error",
    }
  }

  if (resolution.status === "resolved" && result.error) {
    return {
      content: result.error,
      state: "error",
    }
  }

  return undefined
}

function createReplyContext(
  result: InteractionSubmitResult,
  options: LocalInteractionReplyOptions
): LocalInteractionReplyContext {
  const rawLabel = result.target?.label ?? "目标"
  const targetLabel = result.target?.label
    ? options.targetLabel?.(rawLabel) ?? `「${rawLabel}」`
    : rawLabel
  const action = result.action
  const actionType = String(
    action?.type ?? result.resolution.actionId ?? result.resolution.primitiveAction ?? ""
  ) || undefined

  return {
    result,
    resolution: result.resolution,
    action,
    actionType,
    targetLabel,
  }
}

function formatReply(
  formatter: string | LocalInteractionReplyFormatter | undefined,
  context: LocalInteractionReplyContext
): string | InteractionAssistantReply | undefined {
  if (!formatter) return undefined
  if (typeof formatter === "function") return formatter(context)
  return formatter
    .replace(/\{target\}/g, context.targetLabel)
    .replace(/\{action\}/g, context.actionType ?? "操作")
}

function normalizeReply(
  reply: string | InteractionAssistantReply,
  fallbackState: InteractionAssistantReplyState
): InteractionAssistantReply {
  if (typeof reply === "string") {
    return {
      content: reply,
      state: fallbackState,
    }
  }

  return {
    ...reply,
    state: reply.state ?? fallbackState,
  }
}

function parseJsonValue(content: string): unknown | undefined {
  const text = stripMarkdownFence(content.trim())
  const candidates = [text]
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1))
  const arrayStart = text.indexOf("[")
  const arrayEnd = text.lastIndexOf("]")
  if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.push(text.slice(arrayStart, arrayEnd + 1))

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown
      if (isRecord(parsed) || Array.isArray(parsed)) return parsed
    } catch {
      // Try the next candidate.
    }
  }

  return undefined
}

function stripMarkdownFence(content: string): string {
  const match = content.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return match?.[1]?.trim() ?? content
}

function parseToolCall(
  content: string,
  fallbackUtterance: string
): InteractionAssistantModelAction | InteractionAssistantModelBatchAction | undefined {
  const text = stripMarkdownFence(content.trim())
  const invokePattern =
    /(?:<\s*)?invoke\s+[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/invoke>/gi
  const resolutions: ResolvedInteraction[] = []

  for (const invoke of text.matchAll(invokePattern)) {
    const params: Record<string, unknown> = {}
    const parameterPattern =
      /<parameter\s+[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/parameter>/gi
    for (const match of invoke[2].matchAll(parameterPattern)) {
      params[match[1]] = decodeXmlText(match[2].trim())
    }

    const targetId = typeof params.targetId === "string" ? params.targetId : undefined
    resolutions.push({
      status: "resolved",
      utterance: fallbackUtterance,
      actionId: decodeXmlText(invoke[1].trim()),
      targetId,
      params,
      confidence: 0.9,
      resolverId: "assistant-llm",
    })
  }

  if (resolutions.length === 0) return undefined
  if (resolutions.length === 1) {
    return {
      type: "interaction_action",
      resolution: resolutions[0],
    }
  }

  return {
    type: "interaction_actions",
    resolutions,
  }
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function matchesPolicyList(list: string[] | undefined, value: string | undefined): boolean {
  if (!list?.length || !value) return false
  return list.some((item) => {
    if (item === value) return true
    if (item.endsWith("*")) return value.startsWith(item.slice(0, -1))
    return false
  })
}

function formatPolicySource(source: InteractionActionPolicyContext["source"]): string {
  if (source === "local") return "本地快路径策略"
  if (source === "model") return "模型动作策略"
  return source ? `${source} 策略` : "当前策略"
}
