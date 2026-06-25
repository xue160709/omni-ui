import type { InteractionTurn, VoiceInput } from "@omni-ui/core"
import * as React from "react"
import { useInteractionApi } from "./runtime"

export interface VoiceAdapter {
  start(options?: { signal?: AbortSignal }): Promise<void> | void
  stop(): Promise<void> | void
  subscribe(listener: (input: VoiceInput) => void): () => void
}

export type UseVoiceAdapterOptions = {
  autoStart?: boolean
  submitFinal?: boolean
  onInput?: (input: VoiceInput) => void
  onTurn?: (turn: InteractionTurn) => void
  onError?: (error: unknown) => void
}

export type VoiceAdapterController = {
  start: (options?: { signal?: AbortSignal }) => Promise<void>
  stop: () => Promise<void>
}

// 中文：VoiceAdapter 是 ASR 厂商与 Runtime 的 seam；partial 只预览，final 默认提交。
// English: VoiceAdapter is the seam between ASR vendors and the runtime; partial previews, final submits by default.
export function useVoiceAdapter(
  adapter: VoiceAdapter | undefined,
  options: UseVoiceAdapterOptions = {}
): VoiceAdapterController {
  const interaction = useInteractionApi()
  const optionsRef = React.useRef(options)
  optionsRef.current = options

  React.useEffect(() => {
    if (!adapter) return undefined

    return adapter.subscribe((input) => {
      optionsRef.current.onInput?.(input)
      const shouldSubmit = input.kind === "final" && optionsRef.current.submitFinal !== false
      const work = shouldSubmit ? interaction.submitVoice(input) : interaction.resolveVoice(input)
      void work
        .then((turn) => optionsRef.current.onTurn?.(turn))
        .catch((error) => optionsRef.current.onError?.(error))
    })
  }, [adapter, interaction])

  React.useEffect(() => {
    if (!adapter || !options.autoStart) return undefined

    const controller = new AbortController()
    void Promise.resolve(adapter.start({ signal: controller.signal })).catch((error) =>
      optionsRef.current.onError?.(error)
    )
    return () => {
      controller.abort()
      void Promise.resolve(adapter.stop()).catch((error) => optionsRef.current.onError?.(error))
    }
  }, [adapter, options.autoStart])

  return React.useMemo(
    () => ({
      start: async (startOptions?: { signal?: AbortSignal }) => {
        if (!adapter) return
        await adapter.start(startOptions)
      },
      stop: async () => {
        if (!adapter) return
        await adapter.stop()
      },
    }),
    [adapter]
  )
}
