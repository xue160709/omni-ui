"use client"

import * as React from "react"
import {
  MultimodalGroup,
  type AssistantChatMessage,
  type AssistantConversationMessage,
  type AssistantConversationMessageInput,
  type InteractionHint,
  type UseInteractionAssistantOptions,
  useAssistantConversation,
} from "@multimodal-ui/react"
import { MultimodalButton } from "./button"
import { MultimodalTextarea } from "./textarea"
import { resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalAssistantPanelProps = React.HTMLAttributes<HTMLDivElement> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
  assistantOptions?: UseInteractionAssistantOptions
  placeholder?: string
  sendLabel?: string
  emptyLabel?: string
  initialMessages?: AssistantConversationMessageInput[]
  callModel?: (messages: AssistantChatMessage[]) => Promise<string>
  onMessagesChange?: (messages: AssistantConversationMessage[]) => void
}

export function MultimodalAssistantPanel({
  interactionId = "multimodal.assistant",
  interactionLabel,
  interactionHint,
  assistantOptions,
  placeholder = "Ask this app to do something",
  sendLabel = "Send",
  emptyLabel = "No messages yet.",
  initialMessages = [],
  callModel,
  onMessagesChange,
  children,
  ...props
}: MultimodalAssistantPanelProps) {
  const conversation = useAssistantConversation({
    assistantOptions,
    callModel,
    initialMessages,
    onMessagesChange,
  })

  function submitPrompt(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    void conversation.submitMessage()
  }

  return (
    <MultimodalGroup
      id={interactionId}
      role="assistant"
      label={resolveInteractionLabel(interactionLabel, interactionHint, "Assistant")}
      aliases={resolveInteractionAliases(interactionHint)}
    >
      <section {...props}>
        <div className="space-y-3">
          <div className="space-y-2" aria-live="polite">
            {conversation.messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">{emptyLabel}</p>
            ) : (
              conversation.messages.map((message, index) => (
                <div
                  key={message.id ?? `${message.role}-${index}`}
                  data-state={message.state ?? "ready"}
                  className="rounded-md border p-3 text-sm data-[state=error]:border-destructive"
                >
                  <p className="text-xs font-medium uppercase text-muted-foreground">{message.role}</p>
                  <p className="mt-1 whitespace-pre-wrap">{message.content}</p>
                </div>
              ))
            )}
            {children}
          </div>

          <form className="flex gap-2" onSubmit={(event) => void submitPrompt(event)}>
            <MultimodalTextarea
              interactionId={`${interactionId}.input`}
              interactionLabel="Assistant input"
              placeholder={placeholder}
              value={conversation.draft}
              onChange={(event) => conversation.setDraft(event.currentTarget.value)}
              className="min-h-20 flex-1 resize-none"
            />
            <MultimodalButton
              interactionId={`${interactionId}.send`}
              interactionLabel={sendLabel}
              type="submit"
              disabled={conversation.status === "sending" || !conversation.draft.trim()}
            >
              {conversation.status === "sending" ? "..." : sendLabel}
            </MultimodalButton>
          </form>
        </div>
      </section>
    </MultimodalGroup>
  )
}
