"use client"

import * as React from "react"
import { Button as ShadcnButton } from "@/components/ui/button"
import { useInteractionNode, type InteractionHint } from "@multimodal-ui/react"

type MultimodalButtonProps = React.ComponentProps<typeof ShadcnButton> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalButton = React.forwardRef<
  React.ElementRef<typeof ShadcnButton>,
  MultimodalButtonProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnButton>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["press"],
    hint: interactionHint,
  })

  return <ShadcnButton ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalButton.displayName = "MultimodalButton"

function composeRefs<T>(...refs: Array<React.Ref<T> | undefined>): React.RefCallback<T> {
  return (node) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    })
  }
}
