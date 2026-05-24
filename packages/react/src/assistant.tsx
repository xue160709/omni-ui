import {
  createAssistantSnapshotContext,
  createInteractionAssistantSystemPrompt,
  createLocalInteractionReply,
  parseInteractionAssistantModelReply,
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
} from "@multimodal-ui/core"
import * as React from "react"
import { useInteractionApi } from "./runtime"

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
  ) => Promise<LocalAssistantSubmitResult & { content?: string }>
  createSystemPrompt: () => string
  createChatMessages: (messages: AssistantChatMessage[]) => AssistantChatMessage[]
}

const defaultModelActionPolicy: ModelActionPolicy = {
  mode: "all",
  minConfidence: 0.7,
  allowDomainActions: true,
  allowPrimitiveActions: false,
  requireConfirmationForRisk: ["medium", "high"],
}

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
    ): Promise<LocalAssistantSubmitResult & { content?: string }> => {
      const currentOptions = optionsRef.current
      const parsed = parseInteractionAssistantModelReply(content, utterance)

      if (parsed.type !== "interaction_action") {
        return {
          handled: false,
          content: parsed.content,
        }
      }

      const snapshot = interaction.getSnapshot()
      const resolution = normalizeModelResolutionTarget(
        parsed.resolution,
        snapshot
      )
      const modelPolicy = currentOptions.modelActionPolicy ?? defaultModelActionPolicy
      const policyValidation = validateResolvedInteractionPolicy(resolution, modelPolicy, {
        snapshot,
        confirmedActionId: submitOptions.confirmedActionId,
        source: "model",
      })

      if (!policyValidation.ok) {
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
        baseStateVersion: submitOptions.baseStateVersion ?? snapshot.stateVersion,
      })
      const reply =
        result.ok && result.executed && parsed.reply
          ? { content: parsed.reply, state: "ready" as const }
          : createLocalInteractionReply(result, currentOptions.localReply)

      return {
        handled: Boolean(reply),
        reply,
        result,
      }
    },
    [interaction]
  )

  const createSystemPrompt = React.useCallback(() => {
    const currentOptions = optionsRef.current
    const snapshotContext = createAssistantSnapshotContext(interaction.getSnapshot(), {
      maxObjects: currentOptions.snapshot?.maxObjects,
      includeRecentEvents: currentOptions.snapshot?.includeRecentEvents,
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

function normalizeModelResolutionTarget(
  resolution: ResolvedInteraction,
  snapshot: InteractionSnapshot
): ResolvedInteraction {
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
  if (!resolution.actionId) return undefined
  const spec = snapshot.actionSpecs[resolution.actionId]
  if (!spec) return undefined

  const attachTo = spec.attachTo
  if (attachTo?.id) {
    return snapshot.visibleObjects.find((object) => object.id === attachTo.id)
  }
  if (attachTo?.entityType) {
    return snapshot.visibleObjects.find((object) => object.entity?.type === attachTo.entityType)
  }
  if (attachTo?.role) {
    return snapshot.visibleObjects.find((object) => object.role === attachTo.role)
  }

  if (spec.executeScope === "page") {
    return snapshot.page ?? snapshot.visibleObjects.find((object) => object.type === "page")
  }
  if (spec.executeScope === "container") {
    return snapshot.visibleObjects.find((object) => object.type === "container")
  }

  return undefined
}
