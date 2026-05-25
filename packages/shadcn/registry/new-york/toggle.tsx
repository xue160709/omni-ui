"use client"

import * as React from "react"
import { Toggle as ShadcnToggle } from "@/components/ui/toggle"
import { useInteractionNode, type InteractionHint } from "@omni-ui/react"
import { composeRefs } from "./utils"

type MultimodalToggleProps = React.ComponentProps<typeof ShadcnToggle> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Toggle 注册 toggle/press，适合加粗、收藏、显示隐藏等可反复切换按钮。
// English: Toggle registers toggle/press for repeatable controls such as bold, favorite, or show/hide.
export const MultimodalToggle = React.forwardRef<
  React.ElementRef<typeof ShadcnToggle>,
  MultimodalToggleProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnToggle>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["toggle", "press"],
    hint: interactionHint,
  })

  return <ShadcnToggle ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalToggle.displayName = "MultimodalToggle"

