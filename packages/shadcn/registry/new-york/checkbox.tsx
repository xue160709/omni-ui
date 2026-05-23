"use client"

import * as React from "react"
import { Checkbox as ShadcnCheckbox } from "@/components/ui/checkbox"
import { useInteractionNode, type InteractionHint } from "@multimodal-ui/react"
import { composeRefs } from "./utils"

type MultimodalCheckboxProps = React.ComponentProps<typeof ShadcnCheckbox> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalCheckbox = React.forwardRef<
  React.ElementRef<typeof ShadcnCheckbox>,
  MultimodalCheckboxProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnCheckbox>>({
    id: interactionId,
    role: "checkbox",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["check", "uncheck", "toggle"],
    hint: interactionHint,
  })

  return <ShadcnCheckbox ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalCheckbox.displayName = "MultimodalCheckbox"
