"use client"

import * as React from "react"
import {
  Popover,
  PopoverAnchor,
  PopoverContent as ShadcnPopoverContent,
  PopoverTrigger as ShadcnPopoverTrigger,
} from "@/components/ui/popover"
import {
  MultimodalGroup,
  useInteractionNode,
  type InteractionHint,
} from "@multimodal-ui/react"
import { composeRefs, resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalPopoverTriggerProps = React.ComponentProps<typeof ShadcnPopoverTrigger> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Popover trigger 注册 open/press，适合“打开筛选器/更多信息”等短暂浮层。
// English: Popover trigger registers open/press for transient surfaces such as filters or extra details.
export const MultimodalPopoverTrigger = React.forwardRef<
  React.ElementRef<typeof ShadcnPopoverTrigger>,
  MultimodalPopoverTriggerProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnPopoverTrigger>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["open", "press"],
    hint: interactionHint,
  })

  return <ShadcnPopoverTrigger ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalPopoverTrigger.displayName = "MultimodalPopoverTrigger"

type MultimodalPopoverContentProps = React.ComponentProps<typeof ShadcnPopoverContent> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Popover content 注册为 popover 容器，让其中控件获得局部语义上下文。
// English: Popover content registers as a popover container so controls inside get local context.
export function MultimodalPopoverContent({
  interactionId,
  interactionLabel,
  interactionHint,
  children,
  ...props
}: MultimodalPopoverContentProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="popover"
      label={resolveInteractionLabel(interactionLabel, interactionHint, "浮层")}
      aliases={resolveInteractionAliases(interactionHint)}
    >
      <ShadcnPopoverContent {...props}>{children}</ShadcnPopoverContent>
    </MultimodalGroup>
  )
}

export { Popover, PopoverAnchor }

