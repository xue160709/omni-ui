"use client"

import * as React from "react"
import { NativeSelect as ShadcnNativeSelect } from "@/components/ui/native-select"
import { useInteractionNode, type InteractionHint } from "@multimodal-ui/react"
import { composeRefs } from "./utils"

type MultimodalNativeSelectProps = React.ComponentProps<typeof ShadcnNativeSelect> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：NativeSelect 注册 selectByLabel/selectByIndex，比纯 DOM fallback 更稳定地表达原生选择器。
// English: NativeSelect registers selectByLabel/selectByIndex for stable native-select semantics.
export const MultimodalNativeSelect = React.forwardRef<
  React.ElementRef<typeof ShadcnNativeSelect>,
  MultimodalNativeSelectProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnNativeSelect>>({
    id: interactionId,
    role: "select",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["focus", "selectByLabel", "selectByIndex"],
    hint: interactionHint,
  })

  return <ShadcnNativeSelect ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalNativeSelect.displayName = "MultimodalNativeSelect"

