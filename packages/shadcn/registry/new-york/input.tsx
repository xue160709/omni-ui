"use client"

import * as React from "react"
import { Input as ShadcnInput } from "@/components/ui/input"
import { useInteractionNode, type InteractionHint } from "@omni-ui/react"
import { composeRefs } from "./utils"

type MultimodalInputProps = React.ComponentProps<typeof ShadcnInput> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Input 注册为 textbox，并暴露聚焦、写入、追加和清空文本的 primitive 动作。
// English: Input registers as a textbox and exposes focus, set, append, and clear primitive text actions.
export const MultimodalInput = React.forwardRef<
  React.ElementRef<typeof ShadcnInput>,
  MultimodalInputProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnInput>>({
    id: interactionId,
    role: "textbox",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["focus", "setText", "appendText", "clear"],
    hint: interactionHint,
  })

  return <ShadcnInput ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalInput.displayName = "MultimodalInput"
