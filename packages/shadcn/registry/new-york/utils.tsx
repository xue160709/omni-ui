"use client"

import * as React from "react"
import type { InteractionHint } from "@multimodal-ui/react"

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

export function resolveInteractionLabel(
  interactionLabel?: string,
  interactionHint?: InteractionHint,
  fallbackLabel?: string
): string | undefined {
  return interactionLabel ?? interactionHint?.fallbackLabel ?? fallbackLabel
}

export function resolveInteractionAliases(interactionHint?: InteractionHint): string[] | undefined {
  return interactionHint?.aliases?.length ? interactionHint.aliases : undefined
}
