"use client"

import * as React from "react"
import { Switch as ShadcnSwitch } from "@/components/ui/switch"
import { useInteractionNode, type InteractionHint } from "@omni-ui/react"
import { composeRefs } from "./utils"

type MultimodalSwitchProps = React.ComponentProps<typeof ShadcnSwitch> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Switch 使用 turnOn/turnOff/toggle 语义，比普通按钮更准确地表达开关状态。
// English: Switch uses turnOn, turnOff, and toggle semantics to express switch state more precisely than a generic button.
export const MultimodalSwitch = React.forwardRef<
  React.ElementRef<typeof ShadcnSwitch>,
  MultimodalSwitchProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnSwitch>>({
    id: interactionId,
    role: "switch",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["turnOn", "turnOff", "toggle"],
    hint: interactionHint,
  })

  return <ShadcnSwitch ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalSwitch.displayName = "MultimodalSwitch"
