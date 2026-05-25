"use client"

import * as React from "react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem as ShadcnSelectItem,
  SelectLabel,
  SelectTrigger as ShadcnSelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useInteractionNode, type InteractionHint } from "@omni-ui/react"
import { composeRefs } from "./utils"

type MultimodalSelectTriggerProps = React.ComponentProps<typeof ShadcnSelectTrigger> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Select trigger 注册为 combobox，允许按选项名称或序号进行选择。
// English: Select trigger registers as a combobox, allowing selection by option label or index.
export const MultimodalSelectTrigger = React.forwardRef<
  React.ElementRef<typeof ShadcnSelectTrigger>,
  MultimodalSelectTriggerProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnSelectTrigger>>({
    id: interactionId,
    role: "combobox",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["open", "selectByLabel", "selectByIndex"],
    hint: interactionHint,
  })

  return <ShadcnSelectTrigger ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalSelectTrigger.displayName = "MultimodalSelectTrigger"

type MultimodalSelectItemProps = React.ComponentProps<typeof ShadcnSelectItem> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Select item 注册为 option，供打开的下拉列表中进行精确目标匹配。
// English: Select item registers as an option for precise target matching inside an open list.
export const MultimodalSelectItem = React.forwardRef<
  React.ElementRef<typeof ShadcnSelectItem>,
  MultimodalSelectItemProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnSelectItem>>({
    id: interactionId,
    role: "option",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["select"],
    hint: interactionHint,
  })

  return <ShadcnSelectItem ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalSelectItem.displayName = "MultimodalSelectItem"

export { Select, SelectContent, SelectGroup, SelectLabel, SelectValue }
