"use client"

import * as React from "react"
import { Textarea as ShadcnTextarea } from "@/components/ui/textarea"
import { useInteractionNode, type InteractionHint } from "@omni-ui/react"
import { composeRefs } from "./utils"

type MultimodalTextareaProps = React.ComponentProps<typeof ShadcnTextarea> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Textarea 和 Input 使用同一套 textbox 语义，让长文本字段也能被语音或助手定位。
// English: Textarea shares textbox semantics with Input so long-form fields can be targeted by voice or assistants.
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
