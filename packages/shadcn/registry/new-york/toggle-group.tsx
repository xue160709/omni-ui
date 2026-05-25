"use client"

import * as React from "react"
import {
  ToggleGroup,
  ToggleGroupItem as ShadcnToggleGroupItem,
} from "@/components/ui/toggle-group"
import { useInteractionNode, type InteractionHint } from "@omni-ui/react"
import { composeRefs } from "./utils"

type MultimodalToggleGroupProps = React.ComponentProps<typeof ToggleGroup> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：ToggleGroup 根节点注册为 toggle_group，表达一组互相关联的模式/格式选项。
// English: ToggleGroup root registers as toggle_group for a related set of mode or formatting options.
export const MultimodalToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroup>,
  MultimodalToggleGroupProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ToggleGroup>>({
    id: interactionId,
    role: "toggle_group",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["selectByLabel", "selectByIndex"],
    hint: interactionHint,
  })

  return <ToggleGroup ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalToggleGroup.displayName = "MultimodalToggleGroup"

type MultimodalToggleGroupItemProps = React.ComponentProps<typeof ShadcnToggleGroupItem> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：ToggleGroup item 注册 select/toggle，兼容单选模式和多选模式。
// English: ToggleGroup item registers select/toggle for both single-select and multi-select modes.
export const MultimodalToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ShadcnToggleGroupItem>,
  MultimodalToggleGroupItemProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnToggleGroupItem>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["select", "toggle", "press"],
    hint: interactionHint,
  })

  return <ShadcnToggleGroupItem ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalToggleGroupItem.displayName = "MultimodalToggleGroupItem"

