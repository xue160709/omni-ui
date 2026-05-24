import {
  createAssistantSnapshotContext,
  createInteractionAssistantSystemPrompt,
  createLocalInteractionReply,
  parseInteractionAssistantModelReply,
  shouldSubmitResolvedInteraction,
  type InteractionAssistantPromptOptions,
  type InteractionAssistantReply,
  type InteractionSubmitOptions,
  type InteractionSubmitResult,
  type InteractionSnapshot,
  type LocalExecutionPolicy,
  type LocalInteractionReplyOptions,
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
  localExecution?: LocalExecutionPolicy
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
      if (currentOptions.localExecution?.mode === "off") {
        return { handled: false }
      }

      const resolved = await interaction.resolveText(text)

      if (!shouldSubmitResolvedInteraction(resolved.resolution, currentOptions.localExecution)) {
        if (
          currentOptions.localExecution?.mode !== "allowlist" &&
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

      const resolution = normalizeModelResolutionTarget(
        parsed.resolution,
        interaction.getSnapshot()
      )
      const result = await interaction.dispatchResolution(resolution, {
        ...submitOptions,
        baseStateVersion: submitOptions.baseStateVersion ?? interaction.getSnapshot().stateVersion,
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
  if (!resolution.targetId) return resolution
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
