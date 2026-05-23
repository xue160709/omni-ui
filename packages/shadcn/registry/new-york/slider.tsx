"use client"

import * as React from "react"
import { Slider as ShadcnSlider } from "@/components/ui/slider"
import { useInteractionNode, type InteractionHint } from "@multimodal-ui/react"

type MultimodalSliderProps = React.ComponentProps<typeof ShadcnSlider> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalSlider = React.forwardRef<
  React.ElementRef<typeof ShadcnSlider>,
  MultimodalSliderProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnSlider>>({
    id: interactionId,
    role: "slider",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["setValue", "increase", "decrease"],
    hint: interactionHint,
  })

  return <ShadcnSlider ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalSlider.displayName = "MultimodalSlider"

function composeRefs<T>(...refs: Array<React.Ref<T> | undefined>): React.RefCallback<T> {
  return (node) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    })
  }
}
