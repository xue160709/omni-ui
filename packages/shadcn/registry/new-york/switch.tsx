"use client"

import * as React from "react"
import { Switch as ShadcnSwitch } from "@/components/ui/switch"
import { useInteractionNode, type InteractionHint } from "@multimodal-ui/react"
import { composeRefs } from "./utils"

type MultimodalSwitchProps = React.ComponentProps<typeof ShadcnSwitch> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

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
