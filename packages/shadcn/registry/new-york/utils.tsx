"use client"

import * as React from "react"
import type { InteractionHint } from "@multimodal-ui/react"

// 中文：合并 shadcn 原始 ref 和 Multimodal 注册 ref，让包装组件仍保持普通 ref 透传能力。
// English: Merges the original shadcn ref with the Multimodal registration ref so wrappers still forward refs normally.
export function composeRefs<T>(...refs: Array<React.Ref<T> | undefined>): React.RefCallback<T> {
  return (node) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    })
  }
}

export type InteractionProps = {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：interactionLabel 优先，其次使用 hint fallback，最后才用组件自带 label。
// English: interactionLabel wins first, then hint fallback, and finally the component's own label.
export function resolveInteractionLabel(
  interactionLabel?: string,
  interactionHint?: InteractionHint,
  fallbackLabel?: string
): string | undefined {
  return interactionLabel ?? interactionHint?.fallbackLabel ?? fallbackLabel
}

// 中文：只在确实提供别名时返回数组，避免 snapshot 出现空 aliases 字段。
// English: Returns aliases only when provided so snapshots avoid empty alias fields.
export function resolveInteractionAliases(interactionHint?: InteractionHint): string[] | undefined {
  return interactionHint?.aliases?.length ? interactionHint.aliases : undefined
}
