"use client"

import * as React from "react"
import { Checkbox as ShadcnCheckbox } from "@/components/ui/checkbox"
import { useInteractionNode, type InteractionHint } from "@omni-ui/react"
import { composeRefs } from "./utils"

type MultimodalCheckboxProps = React.ComponentProps<typeof ShadcnCheckbox> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Checkbox 注册 check/uncheck/toggle，便于“勾选/取消勾选”命令映射到真实控件。
// English: Checkbox registers check, uncheck, and toggle so commands map to the real control.
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
