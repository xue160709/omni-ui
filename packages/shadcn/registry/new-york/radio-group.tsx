"use client"

import * as React from "react"
import {
  RadioGroup,
  RadioGroupItem as ShadcnRadioGroupItem,
} from "@/components/ui/radio-group"
import { useInteractionNode, type InteractionHint } from "@multimodal-ui/react"
import { composeRefs } from "./utils"

type MultimodalRadioGroupProps = React.ComponentProps<typeof RadioGroup> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：RadioGroup 根节点注册为 radiogroup，表达“按标签或序号选择一个选项”的组合语义。
// English: RadioGroup root registers as a radiogroup for "choose an option by label or index" semantics.
export const MultimodalRadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroup>,
  MultimodalRadioGroupProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof RadioGroup>>({
    id: interactionId,
    role: "radiogroup",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["selectByLabel", "selectByIndex"],
    hint: interactionHint,
  })

  return <RadioGroup ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalRadioGroup.displayName = "MultimodalRadioGroup"

type MultimodalRadioGroupItemProps = React.ComponentProps<typeof ShadcnRadioGroupItem> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Radio item 暴露 select，便于“选中标准/高级/第一个”这类命令定位真实选项。
// English: Radio item exposes select so commands can target the concrete visible option.
export const MultimodalRadioGroupItem = React.forwardRef<
  React.ElementRef<typeof ShadcnRadioGroupItem>,
  MultimodalRadioGroupItemProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnRadioGroupItem>>({
    id: interactionId,
    role: "radio",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["select"],
    hint: interactionHint,
  })

  return <ShadcnRadioGroupItem ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalRadioGroupItem.displayName = "MultimodalRadioGroupItem"

