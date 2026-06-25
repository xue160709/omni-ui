import {
  createAssistantSnapshotContext,
  createInteractionAssistantSystemPrompt,
  createLocalInteractionReply,
  parseInteractionAssistantModelReply,
  resolveLlmHypothesesAgainstSnapshot,
  shouldSubmitResolvedInteraction,
  validateResolvedInteractionPolicy,
  type InteractionAssistantPromptOptions,
  type InteractionAssistantReply,
  type InteractionSubmitOptions,
  type InteractionSubmitResult,
  type InteractionSnapshot,
  type LocalExecutionPolicy,
  type LocalInteractionReplyOptions,
  type ModelActionPolicy,
  type ResolvedInteraction,
} from "@omni-ui/core"
import * as React from "react"
import { useInteractionApi, type InteractionApi } from "./runtime"

export type AssistantChatMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

export type LocalAssistantSubmitResult = {
  handled: boolean
  reply?: InteractionAssistantReply
  result?: InteractionSubmitResult
}

export type UseInteractionAssistantOptions = {
  localFastPath?: LocalExecutionPolicy
  /** @deprecated Use localFastPath for deterministic local execution policy. */
  localExecution?: LocalExecutionPolicy
  modelActionPolicy?: ModelActionPolicy
  localReply?: LocalInteractionReplyOptions
  prompt?: InteractionAssistantPromptOptions
  snapshot?: {
    maxObjects?: number
    includeRecentEvents?: boolean
  }
}

export type InteractionAssistantApi = {
  trySubmitLocal: (
    text: string,
    options?: InteractionSubmitOptions
  ) => Promise<LocalAssistantSubmitResult>
  trySubmitModelReply: (
    content: string,
    utterance: string,
    options?: InteractionSubmitOptions
  ) => Promise<LocalAssistantSubmitResult & { content?: string; results?: InteractionSubmitResult[] }>
  createSystemPrompt: () => string
  createChatMessages: (messages: AssistantChatMessage[]) => AssistantChatMessage[]
}

const defaultModelActionPolicy: ModelActionPolicy = {
  mode: "off",
  minConfidence: 0.82,
  allowDomainActions: false,
  allowPrimitiveActions: false,
  requireConfirmationForRisk: ["medium", "high"],
}

// 中文：assistant hook 把本地快路径、模型 action 解析和本地执行校验串成一个可复用聊天入口。
// English: This assistant hook chains local fast-path handling, model action parsing, and local execution validation into one reusable chat entry.
export function useInteractionAssistant(
  options: UseInteractionAssistantOptions = {}
): InteractionAssistantApi {
  const interaction = useInteractionApi()
  const optionsRef = React.useRef(options)
  optionsRef.current = options

  const trySubmitLocal = React.useCallback(
    async (
      text: string,
      submitOptions: InteractionSubmitOptions = {}
    ): Promise<LocalAssistantSubmitResult> => {
      const currentOptions = optionsRef.current
      const localPolicy = currentOptions.localFastPath ?? currentOptions.localExecution

      if (localPolicy?.mode === "off") {
        return { handled: false }
      }

      const resolved = await interaction.resolveText(text)

      if (!shouldSubmitResolvedInteraction(resolved.resolution, localPolicy)) {
        // 中文：本地解析需要澄清时可以直接生成回复；否则交给外部模型继续处理。
        // English: Local clarification can produce a reply immediately; other misses fall through to an external model.
        if (
          localPolicy?.mode !== "allowlist" &&
          resolved.resolution.status === "needs_clarification"
        ) {
          const reply = createLocalInteractionReply(
            {
              ...resolved,
              ok: false,
              executed: false,
            },
            currentOptions.localReply
          )

          return {
            handled: Boolean(reply),
            reply,
            result: {
              ...resolved,
              ok: false,
              executed: false,
            },
          }
        }

        return { handled: false }
      }

      const result = await interaction.dispatchResolution(resolved.resolution, {
        ...submitOptions,
        baseStateVersion: submitOptions.baseStateVersion ?? resolved.snapshot.stateVersion,
      })
      const reply = createLocalInteractionReply(result, currentOptions.localReply)

      return {
        handled: Boolean(reply),
        reply,
        result,
      }
    },
    [interaction]
  )

  const trySubmitModelReply = React.useCallback(
    async (
      content: string,
      utterance: string,
      submitOptions: InteractionSubmitOptions = {}
    ): Promise<LocalAssistantSubmitResult & { content?: string; results?: InteractionSubmitResult[] }> => {
      const currentOptions = optionsRef.current
      const parsed = parseInteractionAssistantModelReply(content, utterance)

      // 中文：模型可以返回语义假设、单个 action、批量 action，或普通消息；只有 proposal 会进入本地裁决/dispatch。
      // English: Model replies may contain semantic hypotheses, one action, a batch, or a plain message; only proposals enter local arbitration/dispatch.
      if (parsed.type !== "interaction_action") {
        if (parsed.type === "interaction_hypotheses") {
          const resolution = resolveLlmHypothesesAgainstSnapshot(
            parsed.hypotheses,
            interaction.getSnapshot(),
            utterance,
            "assistant-llm"
          )
          return submitModelResolution(
            resolution,
            parsed.reply,
            submitOptions,
            currentOptions,
            interaction
          )
        }

        if (parsed.type === "interaction_actions") {
          const prepared: ResolvedInteraction[] = []
          let forceConfirmation = false
          for (const parsedResolution of parsed.resolutions) {
            const policyResult = prepareModelResolution(
              parsedResolution,
              submitOptions,
              currentOptions,
              interaction
            )
            if ("blocked" in policyResult) {
              return {
                ...policyResult.blocked,
                results: policyResult.results,
              }
            }
            prepared.push(policyResult.resolution)
            forceConfirmation ||= policyResult.forceConfirmation
          }

          const batchResult = await interaction.dispatchBatchResolutions(prepared, {
            ...submitOptions,
            forceConfirmation: forceConfirmation || submitOptions.forceConfirmation,
            baseStateVersion: submitOptions.baseStateVersion ?? interaction.getSnapshot().stateVersion,
          })
          const results = batchResult.results
          const failed = results.find((result) => !result.ok || !result.executed)
          if (failed) {
            const reply = createLocalInteractionReply(failed, currentOptions.localReply)
            return {
              handled: Boolean(reply),
              reply,
              result: failed,
              results,
            }
          }
          const reply =
            parsed.reply ??
            `已执行 ${results.filter((result) => result.ok && result.executed).length} 个操作。`

          return {
            handled: true,
            reply: {
              content: reply,
              state: "ready",
            },
            result: results[results.length - 1],
            results,
          }
        }

        return {
          handled: false,
          content: parsed.content,
        }
      }

      return submitModelResolution(
        parsed.resolution,
        parsed.reply,
        submitOptions,
        currentOptions,
        interaction
      )
    },
    [interaction]
  )

  const createSystemPrompt = React.useCallback(() => {
    const currentOptions = optionsRef.current
    const snapshotContext = createAssistantSnapshotContext(interaction.getSnapshot(), {
      maxObjects: currentOptions.snapshot?.maxObjects,
      includeRecentEvents: currentOptions.snapshot?.includeRecentEvents,
      allowedActionIds: currentOptions.modelActionPolicy?.actionIds,
      enforceModelCallable: true,
    })

    return createInteractionAssistantSystemPrompt(snapshotContext, currentOptions.prompt)
  }, [interaction])

  const createChatMessages = React.useCallback(
    (messages: AssistantChatMessage[]) => [
      {
        role: "system" as const,
        content: createSystemPrompt(),
      },
      ...messages,
    ],
    [createSystemPrompt]
  )

  return React.useMemo(
    () => ({
      trySubmitLocal,
      trySubmitModelReply,
      createSystemPrompt,
      createChatMessages,
    }),
    [createChatMessages, createSystemPrompt, trySubmitLocal, trySubmitModelReply]
  )
}

function prepareModelResolution(
  parsedResolution: ResolvedInteraction,
  submitOptions: InteractionSubmitOptions,
  currentOptions: UseInteractionAssistantOptions,
  interaction: InteractionApi
):
  | { resolution: ResolvedInteraction; forceConfirmation: boolean }
  | {
      blocked: LocalAssistantSubmitResult
      results: InteractionSubmitResult[]
    } {
  const snapshot = interaction.getSnapshot()
  const resolution = normalizeModelResolutionTarget(parsedResolution, snapshot)
  const modelPolicy = currentOptions.modelActionPolicy ?? defaultModelActionPolicy
  const policyValidation = validateResolvedInteractionPolicy(resolution, modelPolicy, {
    snapshot,
    confirmedActionId: submitOptions.confirmedActionId,
    source: "model",
  })
  const policyRequiresConfirmation =
    !policyValidation.ok && policyValidation.code === "confirmation_required"

  if (!policyValidation.ok && !policyRequiresConfirmation) {
    const target = resolution.targetId
      ? snapshot.visibleObjects.find((object) => object.id === resolution.targetId)
      : undefined
    const result: InteractionSubmitResult = {
      snapshot,
      resolution,
      ok: false,
      executed: false,
      target,
      validation: policyValidation,
      error: policyValidation.reason,
    }
    const reply = createLocalInteractionReply(result, currentOptions.localReply)
    return {
      blocked: {
        handled: Boolean(reply),
        reply,
        result,
      },
      results: [result],
    }
  }

  return {
    resolution,
    forceConfirmation: policyRequiresConfirmation,
  }
}

async function submitModelResolution(
  parsedResolution: ResolvedInteraction,
  successReply: string | undefined,
  submitOptions: InteractionSubmitOptions,
  currentOptions: UseInteractionAssistantOptions,
  interaction: InteractionApi
): Promise<LocalAssistantSubmitResult> {
  // 中文：模型给出的候选动作会重新按当前 snapshot 归一化并校验，防止 stale target 或越权 action。
  // English: Model-proposed actions are normalized and validated against the current snapshot to prevent stale targets or unauthorized actions.
  const snapshot = interaction.getSnapshot()
  const resolution = normalizeModelResolutionTarget(parsedResolution, snapshot)
  const modelPolicy = currentOptions.modelActionPolicy ?? defaultModelActionPolicy
  const policyValidation = validateResolvedInteractionPolicy(resolution, modelPolicy, {
    snapshot,
    confirmedActionId: submitOptions.confirmedActionId,
    source: "model",
  })
  const policyRequiresConfirmation =
    !policyValidation.ok && policyValidation.code === "confirmation_required"

  if (!policyValidation.ok && !policyRequiresConfirmation) {
    const target = resolution.targetId
      ? snapshot.visibleObjects.find((object) => object.id === resolution.targetId)
      : undefined
    const result: InteractionSubmitResult = {
      snapshot,
      resolution,
      ok: false,
      executed: false,
      target,
      validation: policyValidation,
      error: policyValidation.reason,
    }
    const reply = createLocalInteractionReply(result, currentOptions.localReply)

    return {
      handled: Boolean(reply),
      reply,
      result,
    }
  }

  const result = await interaction.dispatchResolution(resolution, {
    ...submitOptions,
    forceConfirmation: policyRequiresConfirmation || submitOptions.forceConfirmation,
    baseStateVersion: submitOptions.baseStateVersion ?? snapshot.stateVersion,
  })
  const reply =
    result.ok && result.executed && successReply
      ? { content: successReply, state: "ready" as const }
      : createLocalInteractionReply(result, currentOptions.localReply)

  return {
    handled: Boolean(reply),
    reply,
    result,
  }
}

function normalizeModelResolutionTarget(
  resolution: ResolvedInteraction,
  snapshot: InteractionSnapshot
): ResolvedInteraction {
  // 中文：有些模型会返回 entity id 而不是 object id，这里把它映射回当前可见对象。
  // English: Some models return an entity id instead of an object id; this maps it back to the visible object.
  if (!resolution.targetId) {
    const target = inferTargetFromAction(resolution, snapshot)
    return target
      ? {
          ...resolution,
          targetId: target.id,
        }
      : resolution
  }

  if (snapshot.visibleObjects.some((object) => object.id === resolution.targetId)) {
    return resolution
  }

  const target = snapshot.visibleObjects.find(
    (object) => object.entity?.id === resolution.targetId
  )

  return target
    ? {
        ...resolution,
        targetId: target.id,
      }
    : resolution
}

function inferTargetFromAction(
  resolution: ResolvedInteraction,
  snapshot: InteractionSnapshot
) {
  // 中文：当 action 自身只可能附着到一个目标时，可从 action spec 推断缺失的 targetId。
  // English: When an action spec points to a single target class, it can infer a missing targetId.
  if (!resolution.actionId) return undefined
  const spec = snapshot.actionSpecs[resolution.actionId]
  if (!spec) return undefined

  const attachTo = spec.attachTo
  if (attachTo?.id) {
    const target = snapshot.visibleObjects.find((object) => object.id === attachTo.id)
    if (target) return target
  }
  if (attachTo?.entityType) {
    const target = snapshot.visibleObjects.find((object) => object.entity?.type === attachTo.entityType)
    if (target) return target
  }
  if (attachTo?.role) {
    const target = snapshot.visibleObjects.find((object) => object.role === attachTo.role)
    if (target) return target
  }

  if (spec.executeScope === "page") {
    return snapshot.page ?? snapshot.visibleObjects.find((object) => object.type === "page")
  }
  if (spec.executeScope === "container") {
    return snapshot.visibleObjects.find((object) => object.type === "container")
  }

  return undefined
}
