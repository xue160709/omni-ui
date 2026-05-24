"use client"

import * as React from "react"
import { Progress as ShadcnProgress } from "@/components/ui/progress"
import { useInteractionNode, type InteractionHint } from "@multimodal-ui/react"
import { composeRefs } from "./utils"

type MultimodalProgressProps = React.ComponentProps<typeof ShadcnProgress> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Progress 注册为 progressbar，让助手能回答当前进度和状态。
// English: Progress registers as progressbar so assistants can read current progress state.
export const MultimodalProgress = React.forwardRef<
  React.ElementRef<typeof ShadcnProgress>,
  MultimodalProgressProps
>(({ interactionId, interactionLabel, interactionHint, value, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnProgress>>({
    id: interactionId,
    role: "progressbar",
    label: interactionLabel,
    labelFrom: "aria",
    actions: [],
    state: { value },
    hint: interactionHint,
  })

  return <ShadcnProgress ref={composeRefs(ref, mmRef)} value={value} {...props} />
})
MultimodalProgress.displayName = "MultimodalProgress"

