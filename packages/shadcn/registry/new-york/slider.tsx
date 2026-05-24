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

// 中文：Slider 暴露 setValue/increase/decrease，支持“调高音量/降低阈值”这类相对控制。
// English: Slider exposes setValue, increase, and decrease for relative controls such as raising volume or lowering a threshold.
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
