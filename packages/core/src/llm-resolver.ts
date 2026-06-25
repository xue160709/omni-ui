import type {
  IntentResolver,
  InteractionSnapshot,
  ResolvedInteraction,
} from "./types"
import type { FusionRankerResult } from "./fusion"
import type { RankedInteractionCandidate, SemanticIntentHypothesis, TargetReference } from "./turn"
import { createLlmSnapshotContext } from "./snapshot"
import { rankInteractionCandidates } from "./fusion"
import { normalizePrimitiveAction, normalizePrimitiveActions } from "./primitive"

export type LlmResolverInput = {
  utterance: string
  snapshot: InteractionSnapshot
  schema: typeof LLM_RESOLVER_SCHEMA
  signal?: AbortSignal
}

export type LlmResolverCompletion = (
  input: LlmResolverInput
) => Promise<string | unknown> | string | unknown

export type CreateLlmResolverOptions = {
  id?: string
  complete: LlmResolverCompletion
}

export type LlmProviderEnv = Record<string, string | undefined>

export type LlmProviderFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

export type CreateOpenAIResolverOptions = {
  id?: string
  baseUrl?: string
  model?: string
  apiKeyEnv?: string
  baseUrlEnv?: string
  modelEnv?: string
  env?: LlmProviderEnv
  fetch?: LlmProviderFetch
  systemPrompt?: string
  maxTokens?: number
}

export type CreateAnthropicResolverOptions = {
  id?: string
  baseUrl?: string
  model?: string
  apiKeyEnv?: string
  baseUrlEnv?: string
  modelEnv?: string
  versionEnv?: string
  env?: LlmProviderEnv
  fetch?: LlmProviderFetch
  systemPrompt?: string
  maxTokens?: number
}

// 中文：resolver schema 是模型输出的最小契约，运行时还会继续做策略和状态校验。
// English: The resolver schema is the model's minimal output contract; runtime policy and state validation still follow.
export const LLM_RESOLVER_SCHEMA = {
  type: "object",
  required: [],
  properties: {
    status: {
      enum: ["resolved", "needs_clarification", "not_found", "unsupported"],
    },
    utterance: { type: "string" },
    intent: { type: "string" },
    targetId: { type: "string" },
    targetCandidates: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "confidence"],
        properties: {
          id: { type: "string" },
          confidence: { type: "number" },
          reason: { type: "string" },
        },
      },
    },
    actionId: { type: "string" },
    primitiveAction: { type: "string" },
    params: { type: "object" },
    hypotheses: {
      type: "array",
      items: {
        type: "object",
        required: ["intent", "targetReference", "confidence"],
        properties: {
          intent: { type: "string" },
          actionHint: { type: "string" },
          targetReference: { type: "object" },
          slots: { type: "object" },
          missingSlots: { type: "array", items: { type: "string" } },
          confidence: { type: "number" },
          reason: { type: "string" },
          modelTargetIdHint: { type: "string" },
        },
      },
    },
    confidence: { type: "number" },
    reason: { type: "string" },
  },
} as const

export const DEFAULT_LLM_RESOLVER_SYSTEM_PROMPT =
  "You resolve natural-language UI commands against the provided Interaction Snapshot. Return only one JSON object matching the schema. Prefer hypotheses: intent, actionHint, targetReference, slots, missingSlots, confidence, and optional modelTargetIdHint. Use only actionHint, targetId, and primitiveAction values present in the snapshot. If the request is ambiguous, return multiple hypotheses or needs_clarification."

// 中文：通用 LLM resolver 只负责把 provider 输出归一化成 ResolvedInteraction，不直接执行任何操作。
// English: The generic LLM resolver only normalizes provider output into ResolvedInteraction and never executes actions directly.
export function createLlmResolver(options: CreateLlmResolverOptions): IntentResolver {
  return {
    id: options.id ?? "llm",
    async resolve({ utterance, snapshot, signal }) {
      try {
        const output = await options.complete({
          utterance,
          snapshot,
          schema: LLM_RESOLVER_SCHEMA,
          signal,
        })
        const hypotheses = normalizeLlmHypotheses(output, utterance, options.id ?? "llm")
        if (hypotheses.length) {
          return resolveLlmHypothesesAgainstSnapshot(hypotheses, snapshot, utterance, options.id ?? "llm")
        }
        const candidate = normalizeLlmOutput(output, utterance, options.id ?? "llm")
        return validateLlmResolutionAgainstSnapshot(candidate, snapshot)
      } catch (error) {
        return {
          status: "unsupported",
          utterance,
          confidence: 0,
          reason: error instanceof Error ? error.message : "LLM resolver failed",
          resolverId: options.id ?? "llm",
        }
      }
    },
  }
}

// 中文：OpenAI 适配器默认调用 chat/completions，并要求 JSON object 响应以降低解析失败率。
// English: The OpenAI adapter uses chat/completions by default and requests a JSON object to reduce parse failures.
export function createOpenAIResolver(options: CreateOpenAIResolverOptions = {}): IntentResolver {
  return createLlmResolver({
    id: options.id ?? "openai",
    complete: async (input) => {
      const config = resolveOpenAIConfig(options)
      const payload = {
        model: config.model,
        temperature: 0,
        max_tokens: options.maxTokens ?? 700,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: options.systemPrompt ?? DEFAULT_LLM_RESOLVER_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: createLlmResolverPrompt(input),
          },
        ],
      }

      const data = await requestJson(
        config.fetch,
        `${trimTrailingSlash(config.baseUrl)}/chat/completions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.apiKey}`,
          },
          signal: input.signal,
          body: JSON.stringify(payload),
        },
        "OpenAI"
      )

      return readOpenAIContent(data)
    },
  })
}

// 中文：Anthropic 适配器保持同一套 prompt/schema，便于不同 provider 之间替换。
// English: The Anthropic adapter keeps the same prompt/schema so providers can be swapped with minimal app changes.
export function createAnthropicResolver(options: CreateAnthropicResolverOptions = {}): IntentResolver {
  return createLlmResolver({
    id: options.id ?? "anthropic",
    complete: async (input) => {
      const config = resolveAnthropicConfig(options)
      const payload = {
        model: config.model,
        max_tokens: options.maxTokens ?? 700,
        temperature: 0,
        system: options.systemPrompt ?? DEFAULT_LLM_RESOLVER_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: createLlmResolverPrompt(input),
          },
        ],
      }

      const data = await requestJson(
        config.fetch,
        `${trimTrailingSlash(config.baseUrl)}/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": config.version,
          },
          signal: input.signal,
          body: JSON.stringify(payload),
        },
        "Anthropic"
      )

      return readAnthropicContent(data)
    },
  })
}

export function createLlmResolverPrompt(input: LlmResolverInput): string {
  // 中文：prompt 里包含压缩后的 snapshot，而不是完整 DOM 或源码。
  // English: The prompt includes a compact snapshot rather than the full DOM or source code.
  return JSON.stringify(
    {
      utterance: input.utterance,
      snapshot: createLlmSnapshotContext(input.snapshot),
      schema: input.schema,
    },
    null,
    2
  )
}

export function normalizeLlmOutput(
  output: unknown,
  fallbackUtterance: string,
  resolverId = "llm"
): ResolvedInteraction {
  // 中文：provider 可能返回字符串或对象；这里统一解析、裁剪置信度并补齐 fallback 字段。
  // English: Providers may return strings or objects; this normalizes parsing, clamps confidence, and fills fallback fields.
  const parsed = typeof output === "string" ? parseJsonObject(output) : output

  if (!parsed || typeof parsed !== "object") {
    return {
      status: "unsupported",
      utterance: fallbackUtterance,
      confidence: 0,
      reason: "LLM resolver returned invalid JSON",
      resolverId,
    }
  }

  const record = parsed as Record<string, unknown>
  const status = isResolvedStatus(record.status) ? record.status : "unsupported"
  const confidence = clampConfidence(record.confidence)
  const targetCandidates = Array.isArray(record.targetCandidates)
    ? record.targetCandidates
        .map((candidate) => normalizeTargetCandidate(candidate))
        .filter((candidate): candidate is NonNullable<ReturnType<typeof normalizeTargetCandidate>> =>
          Boolean(candidate)
        )
        .sort((a, b) => b.confidence - a.confidence)
    : undefined

  return {
    status,
    utterance: typeof record.utterance === "string" ? record.utterance : fallbackUtterance,
    intent: typeof record.intent === "string" ? record.intent : undefined,
    targetId: typeof record.targetId === "string" ? record.targetId : targetCandidates?.[0]?.id,
    targetCandidates,
    actionId: typeof record.actionId === "string" ? record.actionId : undefined,
    primitiveAction: typeof record.primitiveAction === "string"
      ? normalizePrimitiveAction(record.primitiveAction)
      : undefined,
    params: isRecord(record.params) ? record.params : undefined,
    confidence,
    reason: typeof record.reason === "string" ? record.reason : undefined,
    resolverId,
  }
}

export function normalizeLlmHypotheses(
  output: unknown,
  fallbackUtterance: string,
  resolverId = "llm"
): SemanticIntentHypothesis[] {
  const parsed = typeof output === "string" ? parseJsonObject(output) : output
  if (!isRecord(parsed)) return []

  const sources = Array.isArray(parsed.hypotheses)
    ? parsed.hypotheses
    : isHypothesisLike(parsed)
      ? [parsed]
      : []

  return sources
    .map((source, index) =>
      normalizeHypothesisSource(source, fallbackUtterance, resolverId, index)
    )
    .filter((hypothesis): hypothesis is SemanticIntentHypothesis => Boolean(hypothesis))
}

export function resolveLlmHypothesesAgainstSnapshot(
  hypotheses: SemanticIntentHypothesis[],
  snapshot: InteractionSnapshot,
  utterance: string,
  resolverId = "llm"
): ResolvedInteraction {
  const missingSlots = hypotheses.flatMap((hypothesis) => hypothesis.missingSlots ?? [])
  if (missingSlots.length > 0) {
    return {
      status: "needs_clarification",
      utterance,
      confidence: Math.max(...hypotheses.map((hypothesis) => hypothesis.confidence), 0),
      reason: `Missing slots: ${[...new Set(missingSlots)].join(", ")}`,
      resolverId,
    }
  }

  const ranked = rankInteractionCandidates(snapshot, hypotheses)
  return fusionResultToResolution(ranked, hypotheses, utterance, resolverId)
}

export function validateLlmResolutionAgainstSnapshot(
  resolution: ResolvedInteraction,
  snapshot: InteractionSnapshot
): ResolvedInteraction {
  if (resolution.status !== "resolved") return resolution

  const target = resolution.targetId
    ? snapshot.visibleObjects.find((object) => object.id === resolution.targetId)
    : undefined

  if (!target) {
    return {
      status: "unsupported",
      utterance: resolution.utterance,
      intent: resolution.intent,
      confidence: 0,
      reason: "LLM resolver referenced a targetId that is not present in the snapshot.",
      resolverId: resolution.resolverId,
    }
  }

  if (resolution.actionId) {
    const knownAction =
      Boolean(snapshot.actionSpecs[resolution.actionId]) ||
      Boolean(target.actions?.includes(resolution.actionId))

    if (!knownAction) {
      return {
        status: "unsupported",
        utterance: resolution.utterance,
        intent: resolution.intent,
        targetId: target.id,
        confidence: 0,
        reason: "LLM resolver referenced an actionId that is not available on the target.",
        resolverId: resolution.resolverId,
      }
    }
  }

  if (
    resolution.primitiveAction &&
    !normalizePrimitiveActions(target.primitiveActions)?.includes(
      normalizePrimitiveAction(resolution.primitiveAction)
    )
  ) {
    return {
      status: "unsupported",
      utterance: resolution.utterance,
      intent: resolution.intent,
      targetId: target.id,
      confidence: 0,
      reason: "LLM resolver referenced a primitiveAction that is not available on the target.",
      resolverId: resolution.resolverId,
    }
  }

  if (!resolution.actionId && !resolution.primitiveAction) {
    return {
      status: "unsupported",
      utterance: resolution.utterance,
      intent: resolution.intent,
      targetId: target.id,
      confidence: 0,
      reason: "LLM resolver did not provide an executable action.",
      resolverId: resolution.resolverId,
    }
  }

  return resolution
}

function fusionResultToResolution(
  ranked: FusionRankerResult,
  hypotheses: SemanticIntentHypothesis[],
  utterance: string,
  resolverId: string
): ResolvedInteraction {
  if (ranked.status === "ready") {
    const selectedCandidate = ranked.candidates.find(
      (candidate) =>
        !candidate.rejected &&
        candidate.targetId === ranked.decision.targetId &&
        candidate.actionId === ranked.decision.actionId &&
        candidate.primitiveAction === ranked.decision.primitiveAction
    )
    const selectedHypothesis = hypotheses.find(
      (hypothesis) => hypothesis.id === selectedCandidate?.hypothesisId
    )
    return {
      status: "resolved",
      utterance,
      intent: selectedHypothesis?.intent,
      targetId: ranked.decision.targetId,
      targetCandidates: candidateSummaries(ranked.candidates),
      actionId: ranked.decision.actionId,
      primitiveAction: ranked.decision.primitiveAction,
      params: ranked.decision.params,
      confidence: ranked.decision.score,
      reason: "Resolved from semantic hypotheses and GUI fusion.",
      resolverId,
    }
  }

  return {
    status: ranked.status === "needs_clarification" ? "needs_clarification" : "not_found",
    utterance,
    targetCandidates: candidateSummaries(ranked.candidates),
    confidence: ranked.candidates[0]?.score ?? 0,
    reason: ranked.reason,
    resolverId,
  }
}

function candidateSummaries(candidates: RankedInteractionCandidate[]) {
  return candidates
    .filter((candidate) => !candidate.rejected)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((candidate) => ({
      id: candidate.targetId,
      confidence: candidate.score,
      reason: candidate.evidence.map((item) => item.type).join(","),
    }))
}

function normalizeHypothesisSource(
  source: unknown,
  fallbackUtterance: string,
  resolverId: string,
  index: number
): SemanticIntentHypothesis | undefined {
  if (!isRecord(source)) return undefined
  const targetReference = normalizeTargetReference(source.targetReference, source)
  if (!targetReference) return undefined

  const confidence = clampConfidence(source.confidence)
  return {
    id: typeof source.id === "string" ? source.id : `${resolverId}_hypothesis_${index + 1}`,
    resolverId,
    source: "llm",
    intent:
      typeof source.intent === "string"
        ? source.intent
        : typeof source.actionHint === "string"
          ? source.actionHint
          : fallbackUtterance,
    actionHint:
      typeof source.actionHint === "string"
        ? source.actionHint
        : typeof source.actionId === "string"
          ? source.actionId
          : typeof source.primitiveAction === "string"
            ? normalizePrimitiveAction(source.primitiveAction)
            : undefined,
    targetReference,
    slots: isRecord(source.slots)
      ? source.slots
      : isRecord(source.params)
        ? source.params
        : {},
    missingSlots: Array.isArray(source.missingSlots)
      ? source.missingSlots.filter((item): item is string => typeof item === "string")
      : undefined,
    confidence,
    reason: typeof source.reason === "string" ? source.reason : undefined,
    modelTargetIdHint:
      typeof source.modelTargetIdHint === "string"
        ? source.modelTargetIdHint
        : typeof source.targetId === "string"
          ? source.targetId
          : undefined,
  }
}

function normalizeTargetReference(
  targetReference: unknown,
  source: Record<string, unknown>
): TargetReference | undefined {
  if (isRecord(targetReference)) {
    const kind = targetReference.kind
    if (kind === "explicit_id" && typeof targetReference.objectId === "string") {
      return { kind, objectId: targetReference.objectId }
    }
    if (kind === "label" && typeof targetReference.text === "string") {
      return { kind, text: targetReference.text }
    }
    if (kind === "ordinal" && typeof targetReference.index === "number") {
      return {
        kind,
        index: targetReference.index,
        scopeHint:
          typeof targetReference.scopeHint === "string"
            ? targetReference.scopeHint
            : undefined,
      }
    }
    if (kind === "deictic" && typeof targetReference.expression === "string") {
      return { kind, expression: targetReference.expression }
    }
    if (
      kind === "focused" &&
      (targetReference.focus === "semantic" ||
        targetReference.focus === "selection" ||
        targetReference.focus === "input")
    ) {
      return { kind, focus: targetReference.focus }
    }
    if (kind === "recent") {
      return {
        kind,
        offset: typeof targetReference.offset === "number" ? targetReference.offset : undefined,
      }
    }
    if (kind === "unspecified") return { kind }
  }

  if (typeof source.targetId === "string") return { kind: "explicit_id", objectId: source.targetId }
  if (typeof source.label === "string") return { kind: "label", text: source.label }

  return undefined
}

function isHypothesisLike(value: Record<string, unknown>): boolean {
  return Boolean(value.targetReference || value.actionHint || value.modelTargetIdHint)
}

function resolveOpenAIConfig(options: CreateOpenAIResolverOptions) {
  const env = options.env ?? getProcessEnv()
  const apiKeyEnv = options.apiKeyEnv ?? "OPENAI_API_KEY"
  const modelEnv = options.modelEnv ?? "OPENAI_MODEL"
  const baseUrlEnv = options.baseUrlEnv ?? "OPENAI_BASE_URL"

  return {
    apiKey: requireConfig(env[apiKeyEnv], apiKeyEnv),
    model: requireConfig(options.model ?? env[modelEnv], modelEnv),
    baseUrl: options.baseUrl ?? env[baseUrlEnv] ?? "https://api.openai.com/v1",
    fetch: options.fetch ?? globalThis.fetch,
  }
}

function resolveAnthropicConfig(options: CreateAnthropicResolverOptions) {
  const env = options.env ?? getProcessEnv()
  const apiKeyEnv = options.apiKeyEnv ?? "ANTHROPIC_API_KEY"
  const modelEnv = options.modelEnv ?? "ANTHROPIC_MODEL"
  const baseUrlEnv = options.baseUrlEnv ?? "ANTHROPIC_BASE_URL"
  const versionEnv = options.versionEnv ?? "ANTHROPIC_VERSION"

  return {
    apiKey: requireConfig(env[apiKeyEnv], apiKeyEnv),
    model: requireConfig(options.model ?? env[modelEnv], modelEnv),
    baseUrl: options.baseUrl ?? env[baseUrlEnv] ?? "https://api.anthropic.com/v1",
    version: env[versionEnv] ?? "2023-06-01",
    fetch: options.fetch ?? globalThis.fetch,
  }
}

function getProcessEnv(): LlmProviderEnv {
  const globalWithProcess = globalThis as typeof globalThis & {
    process?: { env?: LlmProviderEnv }
  }
  return globalWithProcess.process?.env ?? {}
}

function requireConfig(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing ${name}. Set it in the server environment or pass a model/baseUrl option.`)
  }
  return value
}

async function requestJson(
  fetcher: LlmProviderFetch | undefined,
  url: string,
  init: RequestInit,
  provider: string
): Promise<unknown> {
  // 中文：HTTP 错误会附带截断后的响应体，便于定位 provider 配置或鉴权问题。
  // English: HTTP errors include a truncated response body to help diagnose provider configuration or auth issues.
  if (!fetcher) {
    throw new Error(`${provider} resolver requires a fetch implementation.`)
  }

  const response = await fetcher(url, init)
  const text = await response.text()

  if (!response.ok) {
    throw new Error(`${provider} resolver request failed (${response.status}): ${truncate(text)}`)
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error(`${provider} resolver returned invalid JSON: ${truncate(text)}`)
  }
}

function readOpenAIContent(data: unknown): unknown {
  const record = isRecord(data) ? data : {}
  if (typeof record.output_text === "string") return record.output_text

  const choices = Array.isArray(record.choices) ? record.choices : []
  const first = isRecord(choices[0]) ? choices[0] : {}
  const message = isRecord(first.message) ? first.message : {}
  return readTextContent(message.content)
}

function readAnthropicContent(data: unknown): unknown {
  const record = isRecord(data) ? data : {}
  return readTextContent(record.content)
}

function readTextContent(content: unknown): unknown {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return content

  const text = content
    .map((part) => {
      if (!isRecord(part)) return ""
      return typeof part.text === "string" ? part.text : ""
    })
    .join("")
    .trim()

  return text || undefined
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

function truncate(value: string, maxLength = 400): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

function parseJsonObject(output: string): unknown {
  // 中文：优先解析完整 JSON，失败后再抽取第一个对象片段，兼容模型额外输出。
  // English: Parses full JSON first, then falls back to the first object fragment to tolerate extra model text.
  try {
    return JSON.parse(output)
  } catch {
    const match = output.match(/\{[\s\S]*\}/)
    if (!match) return undefined
    try {
      return JSON.parse(match[0])
    } catch {
      return undefined
    }
  }
}

function isResolvedStatus(
  value: unknown
): value is ResolvedInteraction["status"] {
  return (
    value === "resolved" ||
    value === "needs_clarification" ||
    value === "not_found" ||
    value === "unsupported"
  )
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function normalizeTargetCandidate(candidate: unknown) {
  if (!isRecord(candidate) || typeof candidate.id !== "string") return undefined
  return {
    id: candidate.id,
    confidence: clampConfidence(candidate.confidence),
    reason: typeof candidate.reason === "string" ? candidate.reason : undefined,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}
