"use client"

import * as React from "react"
import { Input as ShadcnInput } from "@/components/ui/input"
import { useInteractionNode, type InteractionHint } from "@multimodal-ui/react"

type MultimodalInputProps = React.ComponentProps<typeof ShadcnInput> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalInput = React.forwardRef<
  React.ElementRef<typeof ShadcnInput>,
  MultimodalInputProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnInput>>({
    id: interactionId,
    role: "textbox",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["focus", "setText", "appendText", "clear"],
    hint: interactionHint,
  })

  return <ShadcnInput ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalInput.displayName = "MultimodalInput"

function composeRefs<T>(...refs: Array<React.Ref<T> | undefined>): React.RefCallback<T> {
  return (node) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    })
  }
}
