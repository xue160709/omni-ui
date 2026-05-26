import type { InteractionSubmitResult } from "@omni-ui/core"
import * as React from "react"
import {
  useInteractionAssistant,
  type AssistantChatMessage,
  type InteractionAssistantApi,
  type UseInteractionAssistantOptions,
} from "./assistant"

export type AssistantConversationStatus = "ready" | "sending" | "error"

export type AssistantConversationMessage = {
  id: string
  role: "assistant" | "user"
  content: string
  state?: AssistantConversationStatus | string
}

export type AssistantConversationMessageInput = Omit<AssistantConversationMessage, "id"> & {
  id?: string
}

export type PendingAssistantModelAction = {
  content: string
  utterance: string
  actionId: string
  targetLabel?: string
}

export type UseAssistantConversationOptions = {
  assistantOptions?: UseInteractionAssistantOptions
  assistant?: InteractionAssistantApi
  callModel?: (messages: AssistantChatMessage[]) => Promise<string>
  initialDraft?: string
  initialMessages?: AssistantConversationMessageInput[]
  onMessagesChange?: (messages: AssistantConversationMessage[]) => void
  confirmationTexts?: RegExp
  cancelTexts?: RegExp
  loadingMessage?: string
  confirmingMessage?: string
  canceledMessage?: string
  missingModelMessage?: string
  emptyModelMessage?: string
  formatPendingAction?: (action: PendingAssistantModelAction) => string
  voiceShortcut?: {
    enabled?: boolean
    key?: "Control" | "Alt" | "Shift" | "Meta" | string
    lang?: string
    submitOnRelease?: boolean
    unsupportedMessage?: string
  }
}

export type AssistantConversationApi = {
  messages: AssistantConversationMessage[]
  status: AssistantConversationStatus
  draft: string
  setDraft: React.Dispatch<React.SetStateAction<string>>
  pendingModelAction: PendingAssistantModelAction | null
  isListening: boolean
  submitMessage: (message?: string) => Promise<void>
  startVoiceInput: () => void
  stopVoiceInput: (options?: { submit?: boolean }) => void
  confirmPendingModelAction: (message?: string) => Promise<void>
  cancelPendingModelAction: (message?: string) => void
  addMessage: (message: AssistantConversationMessageInput) => void
  formatPendingAction: (action: PendingAssistantModelAction) => string
}

const defaultConfirmationTexts = /^(确认|确定|好的|好|执行|继续|是的|yes|ok)$/i
const defaultCancelTexts = /^(取消|算了|不用|不要|否|no)$/i
const defaultEmptyModelMessage = "The assistant did not return a message."
const defaultVoiceUnsupportedMessage = "当前浏览器不支持语音输入。"

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}

export function useAssistantConversation(
  options: UseAssistantConversationOptions = {}
): AssistantConversationApi {
  const createdAssistant = useInteractionAssistant(options.assistantOptions)
  const assistant = options.assistant ?? createdAssistant
  const optionsRef = React.useRef(options)
  optionsRef.current = options
  const nextMessageId = React.useRef(1)
  const createMessage = React.useCallback(
    (message: AssistantConversationMessageInput): AssistantConversationMessage => ({
      id: message.id ?? `${message.role}_${nextMessageId.current++}`,
      role: message.role,
      content: message.content,
      state: message.state ?? "ready",
    }),
    []
  )
  const [draft, setDraft] = React.useState(options.initialDraft ?? "")
  const [status, setStatus] = React.useState<AssistantConversationStatus>("ready")
  const [isListening, setIsListening] = React.useState(false)
  const [pendingModelAction, setPendingModelAction] =
    React.useState<PendingAssistantModelAction | null>(null)
  const [messages, setMessages] = React.useState<AssistantConversationMessage[]>(() =>
    (options.initialMessages ?? []).map(createMessage)
  )
  const messagesRef = React.useRef(messages)
  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null)
  const speechBufferRef = React.useRef("")
  const submitVoiceOnEndRef = React.useRef(false)

  React.useEffect(() => {
    messagesRef.current = messages
    optionsRef.current.onMessagesChange?.(messages)
  }, [messages])

  const addMessage = React.useCallback(
    (message: AssistantConversationMessageInput) => {
      setMessages((current) => [...current, createMessage(message)])
    },
    [createMessage]
  )

  const replaceMessage = React.useCallback(
    (id: string, message: Omit<AssistantConversationMessageInput, "role">) => {
      setMessages((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                content: message.content,
                state: message.state ?? item.state,
              }
            : item
        )
      )
    },
    []
  )

  const formatPendingAction = React.useCallback((action: PendingAssistantModelAction) => {
    const formatter = optionsRef.current.formatPendingAction
    if (formatter) return formatter(action)

    const target = action.targetLabel ? ` (${action.targetLabel})` : ""
    return `This action requires confirmation: ${action.actionId}${target}.`
  }, [])

  const confirmPendingModelAction = React.useCallback(
    async (message = "确认执行") => {
      if (!pendingModelAction || status === "sending") return

      const pending = pendingModelAction
      const pendingId = `assistant_${nextMessageId.current++}`

      setPendingModelAction(null)
      setMessages((current) => [
        ...current,
        createMessage({ role: "user", content: message }),
        createMessage({
          id: pendingId,
          role: "assistant",
          content: optionsRef.current.confirmingMessage ?? "Confirming action...",
          state: "sending",
        }),
      ])
      setDraft("")
      setStatus("sending")

      try {
        const modelInteraction = await assistant.trySubmitModelReply(
          pending.content,
          pending.utterance,
          { confirmedActionId: pending.actionId }
        )
        const nextState = modelInteraction.reply?.state === "error" ? "error" : "ready"
        const replyContent =
          modelInteraction.reply?.content ||
          modelInteraction.content ||
          optionsRef.current.emptyModelMessage ||
          defaultEmptyModelMessage

        replaceMessage(pendingId, {
          content: replyContent,
          state: nextState,
        })
        setStatus(nextState)
      } catch (error) {
        replaceMessage(pendingId, {
          content: error instanceof Error ? error.message : "Request failed",
          state: "error",
        })
        setStatus("error")
      }
    },
    [assistant, createMessage, pendingModelAction, replaceMessage, status]
  )

  const cancelPendingModelAction = React.useCallback(
    (message = "取消") => {
      if (!pendingModelAction) return

      setPendingModelAction(null)
      setMessages((current) => [
        ...current,
        createMessage({ role: "user", content: message }),
        createMessage({
          role: "assistant",
          content: optionsRef.current.canceledMessage ?? "Canceled pending action.",
          state: "ready",
        }),
      ])
      setDraft("")
      setStatus("ready")
    },
    [createMessage, pendingModelAction]
  )

  const submitMessage = React.useCallback(
    async (message = draft) => {
      const trimmed = message.trim()
      if (!trimmed || status === "sending") return

      const confirmationTexts = optionsRef.current.confirmationTexts ?? defaultConfirmationTexts
      const cancelTexts = optionsRef.current.cancelTexts ?? defaultCancelTexts

      if (pendingModelAction && cancelTexts.test(trimmed)) {
        cancelPendingModelAction(trimmed)
        return
      }

      if (pendingModelAction && confirmationTexts.test(trimmed)) {
        await confirmPendingModelAction(trimmed)
        return
      }

      if (pendingModelAction) {
        setPendingModelAction(null)
      }

      const userMessage = createMessage({ role: "user", content: trimmed })
      const baseMessages = [...messagesRef.current, userMessage]

      setMessages(baseMessages)
      setDraft("")

      const localInteraction = await assistant.trySubmitLocal(trimmed)

      if (localInteraction.reply) {
        const nextState = localInteraction.reply.state === "error" ? "error" : "ready"
        setMessages((current) => [
          ...current,
          createMessage({
            role: "assistant",
            content: localInteraction.reply!.content,
            state: nextState,
          }),
        ])
        setStatus(nextState)
        return
      }

      const callModel = optionsRef.current.callModel
      if (!callModel) {
        setMessages((current) => [
          ...current,
          createMessage({
            role: "assistant",
            content:
              localInteraction.result?.error ??
              optionsRef.current.missingModelMessage ??
              "No local action matched and no model callback is configured.",
            state: "error",
          }),
        ])
        setStatus("error")
        return
      }

      const pendingId = `assistant_${nextMessageId.current++}`
      const apiMessages = assistant.createChatMessages(
        baseMessages
          .filter((item) => item.state !== "sending" && item.state !== "error")
          .map((item): AssistantChatMessage => ({ role: item.role, content: item.content }))
      )

      setMessages((current) => [
        ...current,
        createMessage({
          id: pendingId,
          role: "assistant",
          content: optionsRef.current.loadingMessage ?? "Generating reply...",
          state: "sending",
        }),
      ])
      setStatus("sending")

      try {
        const content = (await callModel(apiMessages)).trim()
        const modelInteraction = await assistant.trySubmitModelReply(content, trimmed)
        const pendingAction = createPendingModelAction(content, trimmed, modelInteraction.result)
        const nextState = pendingAction
          ? "ready"
          : modelInteraction.reply?.state === "error"
            ? "error"
            : "ready"

        if (pendingAction) {
          setPendingModelAction(pendingAction)
        }

        const replyContent =
          modelInteraction.reply?.content ||
          modelInteraction.content ||
          content ||
          optionsRef.current.emptyModelMessage ||
          defaultEmptyModelMessage

        replaceMessage(pendingId, {
          content: pendingAction ? formatPendingAction(pendingAction) : replyContent,
          state: nextState,
        })
        setStatus(nextState)
      } catch (error) {
        replaceMessage(pendingId, {
          content: error instanceof Error ? error.message : "Request failed",
          state: "error",
        })
        setStatus("error")
      }
    },
    [
      assistant,
      cancelPendingModelAction,
      confirmPendingModelAction,
      createMessage,
      draft,
      formatPendingAction,
      pendingModelAction,
      replaceMessage,
      status,
    ]
  )

  const stopVoiceInput = React.useCallback(
    (stopOptions: { submit?: boolean } = {}) => {
      submitVoiceOnEndRef.current = Boolean(stopOptions.submit)
      recognitionRef.current?.stop()
    },
    []
  )

  const startVoiceInput = React.useCallback(() => {
    const Recognition = getSpeechRecognition()

    if (!Recognition) {
      addMessage({
        role: "assistant",
        content:
          optionsRef.current.voiceShortcut?.unsupportedMessage ??
          defaultVoiceUnsupportedMessage,
        state: "error",
      })
      return
    }

    recognitionRef.current?.stop()
    speechBufferRef.current = ""
    submitVoiceOnEndRef.current = false

    const recognition = new Recognition()
    recognition.lang = optionsRef.current.voiceShortcut?.lang ?? "zh-CN"
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join("")
        .trim()
      if (!transcript) return

      speechBufferRef.current = speechBufferRef.current
        ? `${speechBufferRef.current} ${transcript}`
        : transcript
      setDraft((current) => (current ? `${current} ${transcript}` : transcript))
    }
    recognition.onerror = () => {
      submitVoiceOnEndRef.current = false
      setIsListening(false)
    }
    recognition.onend = () => {
      const shouldSubmit = submitVoiceOnEndRef.current
      const transcript = speechBufferRef.current.trim()
      submitVoiceOnEndRef.current = false
      recognitionRef.current = null
      setIsListening(false)
      if (shouldSubmit && transcript) {
        void submitMessage(transcript)
      }
    }
    recognitionRef.current = recognition
    setIsListening(true)
    recognition.start()
  }, [addMessage, submitMessage])

  React.useEffect(() => {
    const voiceShortcut = options.voiceShortcut
    if (!voiceShortcut?.enabled) return undefined

    const shortcutKey = voiceShortcut.key ?? "Control"

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.key !== shortcutKey || status === "sending") return
      event.preventDefault()
      startVoiceInput()
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== shortcutKey) return
      event.preventDefault()
      stopVoiceInput({ submit: voiceShortcut.submitOnRelease ?? true })
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [options.voiceShortcut, startVoiceInput, status, stopVoiceInput])

  React.useEffect(() => {
    return () => recognitionRef.current?.stop()
  }, [])

  return React.useMemo(
    () => ({
      messages,
      status,
      draft,
      setDraft,
      pendingModelAction,
      isListening,
      submitMessage,
      startVoiceInput,
      stopVoiceInput,
      confirmPendingModelAction,
      cancelPendingModelAction,
      addMessage,
      formatPendingAction,
    }),
    [
      addMessage,
      cancelPendingModelAction,
      confirmPendingModelAction,
      draft,
      formatPendingAction,
      isListening,
      messages,
      pendingModelAction,
      startVoiceInput,
      status,
      stopVoiceInput,
      submitMessage,
    ]
  )
}

function getSpeechRecognition(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined
  const speechWindow = window as Window &
    typeof globalThis & {
      SpeechRecognition?: SpeechRecognitionConstructor
      webkitSpeechRecognition?: SpeechRecognitionConstructor
    }

  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
}

function createPendingModelAction(
  content: string,
  utterance: string,
  result?: InteractionSubmitResult
): PendingAssistantModelAction | null {
  if (!result?.validation || result.validation.ok) return null
  if (result.validation.code !== "confirmation_required") return null

  const actionId = result.resolution.actionId
  if (!actionId) return null

  return {
    content,
    utterance,
    actionId,
    targetLabel: result.target?.label,
  }
}
