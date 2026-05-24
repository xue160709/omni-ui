"use client"

import * as React from "react"
import { Button as ShadcnButton } from "@/components/ui/button"
import { useInteractionNode, type InteractionHint } from "@multimodal-ui/react"
import { composeRefs } from "./utils"

type MultimodalButtonProps = React.ComponentProps<typeof ShadcnButton> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Button 注册为可 press 的按钮目标，适合“点击/确认/打开”这类自然语言命令。
// English: Button registers as a pressable target for natural-language commands such as click, confirm, or open.
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
