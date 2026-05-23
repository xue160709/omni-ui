"use client"

import * as React from "react"
import { Textarea as ShadcnTextarea } from "@/components/ui/textarea"
import { useInteractionNode, type InteractionHint } from "@multimodal-ui/react"
import { composeRefs } from "./utils"

type MultimodalTextareaProps = React.ComponentProps<typeof ShadcnTextarea> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalTextarea = React.forwardRef<
  React.ElementRef<typeof ShadcnTextarea>,
  MultimodalTextareaProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnTextarea>>({
    id: interactionId,
    role: "textbox",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["focus", "setText", "appendText", "clear"],
    hint: interactionHint,
  })

  return <ShadcnTextarea ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalTextarea.displayName = "MultimodalTextarea"
