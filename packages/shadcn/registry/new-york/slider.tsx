"use client"

import * as React from "react"
import { Slider as ShadcnSlider } from "@/components/ui/slider"
import { useInteractionNode, type InteractionHint } from "@multimodal-ui/react"
import { composeRefs } from "./utils"

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
