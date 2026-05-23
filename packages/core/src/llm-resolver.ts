import type {
  IntentResolver,
  InteractionSnapshot,
  ResolvedInteraction,
} from "./types"

export type LlmResolverInput = {
  utterance: string
  snapshot: InteractionSnapshot
  schema: typeof LLM_RESOLVER_SCHEMA
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

export const LLM_RESOLVER_SCHEMA = {
  type: "object",
  required: ["status", "utterance", "confidence"],
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
    confidence: { type: "number" },
    reason: { type: "string" },
  },
} as const

export const DEFAULT_LLM_RESOLVER_SYSTEM_PROMPT =
  "You resolve natural-language UI commands against the provided Interaction Snapshot. Return only one JSON object matching the schema. Use only targetId, actionId, and primitiveAction values present in the snapshot. Prefer domain actionId when available. If the request is ambiguous, return needs_clarification."

export function createLlmResolver(options: CreateLlmResolverOptions): IntentResolver {
  return {
    id: options.id ?? "llm",
    async resolve({ utterance, snapshot }) {
      try {
        const output = await options.complete({
          utterance,
          snapshot,
          schema: LLM_RESOLVER_SCHEMA,
        })
        const candidate = normalizeLlmOutput(output, utterance, options.id ?? "llm")
        return candidate
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
          body: JSON.stringify(payload),
        },
        "OpenAI"
      )

      return readOpenAIContent(data)
    },
  })
}

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
          body: JSON.stringify(payload),
        },
        "Anthropic"
      )

      return readAnthropicContent(data)
    },
  })
}

export function createLlmResolverPrompt(input: LlmResolverInput): string {
  return JSON.stringify(
    {
      utterance: input.utterance,
      snapshot: input.snapshot,
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
    primitiveAction: typeof record.primitiveAction === "string" ? record.primitiveAction : undefined,
    params: isRecord(record.params) ? record.params : undefined,
    confidence,
    reason: typeof record.reason === "string" ? record.reason : undefined,
    resolverId,
  }
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
