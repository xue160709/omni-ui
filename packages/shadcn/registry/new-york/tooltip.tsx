"use client"

import * as React from "react"
import {
  Tooltip,
  TooltipContent as ShadcnTooltipContent,
  TooltipProvider,
  TooltipTrigger as ShadcnTooltipTrigger,
} from "@/components/ui/tooltip"
import {
  MultimodalGroup,
  useInteractionNode,
  type InteractionHint,
} from "@multimodal-ui/react"
import { composeRefs, resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalTooltipTriggerProps = React.ComponentProps<typeof ShadcnTooltipTrigger> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Tooltip trigger 暴露 focus/press，让用户能说“看看这个提示”或直接触发按钮。
// English: Tooltip trigger exposes focus/press for "show this hint" or direct activation.
export const MultimodalTooltipTrigger = React.forwardRef<
  React.ElementRef<typeof ShadcnTooltipTrigger>,
  MultimodalTooltipTriggerProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnTooltipTrigger>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["focus", "press"],
    hint: interactionHint,
  })

  return <ShadcnTooltipTrigger ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalTooltipTrigger.displayName = "MultimodalTooltipTrigger"

type MultimodalTooltipContentProps = React.ComponentProps<typeof ShadcnTooltipContent> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Tooltip content 注册为 tooltip 说明区，便于助手读取当前提示文本。
// English: Tooltip content registers as a tooltip description region for assistant context.
export function MultimodalTooltipContent({
  interactionId,
  interactionLabel,
  interactionHint,
  children,
  ...props
}: MultimodalTooltipContentProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="tooltip"
      label={resolveInteractionLabel(interactionLabel, interactionHint, "提示")}
      aliases={resolveInteractionAliases(interactionHint)}
    >
      <ShadcnTooltipContent {...props}>{children}</ShadcnTooltipContent>
    </MultimodalGroup>
  )
}

export { Tooltip, TooltipProvider }

