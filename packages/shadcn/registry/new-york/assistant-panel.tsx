"use client"

import * as React from "react"
import {
  MultimodalGroup,
  useInteractionAssistant,
  type AssistantChatMessage,
  type InteractionHint,
  type UseInteractionAssistantOptions,
} from "@multimodal-ui/react"
import { MultimodalButton } from "./button"
import { MultimodalTextarea } from "./textarea"
import { resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type AssistantPanelMessage = {
  role: "user" | "assistant"
  content: string
  state?: "ready" | "error" | string
}

type MultimodalAssistantPanelProps = React.HTMLAttributes<HTMLDivElement> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
  assistantOptions?: UseInteractionAssistantOptions
  placeholder?: string
  sendLabel?: string
  emptyLabel?: string
  initialMessages?: AssistantPanelMessage[]
  callModel?: (messages: AssistantChatMessage[]) => Promise<string>
  onMessagesChange?: (messages: AssistantPanelMessage[]) => void
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
  const assistant = useInteractionAssistant(assistantOptions)
  const [draft, setDraft] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [messages, setMessages] = React.useState<AssistantPanelMessage[]>(initialMessages)

  const updateMessages = React.useCallback(
    (next: AssistantPanelMessage[]) => {
      setMessages(next)
      onMessagesChange?.(next)
    },
    [onMessagesChange]
  )

  async function submitPrompt(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const text = draft.trim()
    if (!text || busy) return

    const nextMessages = [...messages, { role: "user" as const, content: text }]
    updateMessages(nextMessages)
    setDraft("")
    setBusy(true)

    try {
      const local = await assistant.trySubmitLocal(text)
      if (local.reply) {
        updateMessages([...nextMessages, { role: "assistant", ...local.reply }])
        return
      }

      if (!callModel) {
        updateMessages([
          ...nextMessages,
          {
            role: "assistant",
            state: "error",
            content: local.result?.error ?? "No local action matched and no model callback is configured.",
          },
        ])
        return
      }

      const modelContent = await callModel(
        assistant.createChatMessages(nextMessages.map(({ role, content }) => ({ role, content })))
      )
      const model = await assistant.trySubmitModelReply(modelContent, text)
      const reply = model.reply
        ? model.reply
        : model.content
          ? { content: model.content, state: "ready" as const }
          : { content: "The assistant did not return a message.", state: "error" as const }

      updateMessages([...nextMessages, { role: "assistant", ...reply }])
    } finally {
      setBusy(false)
    }
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
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">{emptyLabel}</p>
            ) : (
              messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
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
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              className="min-h-20 flex-1 resize-none"
            />
            <MultimodalButton
              interactionId={`${interactionId}.send`}
              interactionLabel={sendLabel}
              type="submit"
              disabled={busy || !draft.trim()}
            >
              {busy ? "..." : sendLabel}
            </MultimodalButton>
          </form>
        </div>
      </section>
    </MultimodalGroup>
  )
}
