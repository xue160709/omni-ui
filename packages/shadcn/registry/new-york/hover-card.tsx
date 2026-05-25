"use client"

import * as React from "react"
import {
  HoverCard,
  HoverCardContent as ShadcnHoverCardContent,
  HoverCardTrigger as ShadcnHoverCardTrigger,
} from "@/components/ui/hover-card"
import {
  MultimodalGroup,
  useInteractionNode,
  type InteractionHint,
} from "@omni-ui/react"
import { composeRefs, resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalHoverCardTriggerProps = React.ComponentProps<typeof ShadcnHoverCardTrigger> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：HoverCard trigger 注册 open/focus，用于“查看这个人的信息”等悬浮详情。
// English: HoverCard trigger registers open/focus for hover-detail surfaces such as profile previews.
export const MultimodalHoverCardTrigger = React.forwardRef<
  React.ElementRef<typeof ShadcnHoverCardTrigger>,
  MultimodalHoverCardTriggerProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnHoverCardTrigger>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["open", "focus", "press"],
    hint: interactionHint,
  })

  return <ShadcnHoverCardTrigger ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalHoverCardTrigger.displayName = "MultimodalHoverCardTrigger"

type MultimodalHoverCardContentProps = React.ComponentProps<typeof ShadcnHoverCardContent> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：HoverCard content 注册为 hovercard 语义区域，暴露当前悬浮详情。
// English: HoverCard content registers as a hovercard semantic region for the visible detail surface.
export function MultimodalHoverCardContent({
  interactionId,
  interactionLabel,
  interactionHint,
  children,
  ...props
}: MultimodalHoverCardContentProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="hovercard"
      label={resolveInteractionLabel(interactionLabel, interactionHint, "详情卡片")}
      aliases={resolveInteractionAliases(interactionHint)}
    >
      <ShadcnHoverCardContent {...props}>{children}</ShadcnHoverCardContent>
    </MultimodalGroup>
  )
}

export { HoverCard }

