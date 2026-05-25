"use client"

import * as React from "react"
import {
  Collapsible,
  CollapsibleContent as ShadcnCollapsibleContent,
  CollapsibleTrigger as ShadcnCollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  MultimodalGroup,
  useInteractionNode,
  type InteractionHint,
} from "@omni-ui/react"
import { composeRefs, resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalCollapsibleTriggerProps = React.ComponentProps<typeof ShadcnCollapsibleTrigger> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Collapsible trigger 暴露 open/close/toggle，适合展开详情、筛选条件和侧栏块。
// English: Collapsible trigger exposes open/close/toggle for details, filters, and sidebar sections.
export const MultimodalCollapsibleTrigger = React.forwardRef<
  React.ElementRef<typeof ShadcnCollapsibleTrigger>,
  MultimodalCollapsibleTriggerProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnCollapsibleTrigger>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["open", "close", "toggle", "press"],
    hint: interactionHint,
  })

  return <ShadcnCollapsibleTrigger ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalCollapsibleTrigger.displayName = "MultimodalCollapsibleTrigger"

type MultimodalCollapsibleContentProps = React.ComponentProps<typeof ShadcnCollapsibleContent> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Collapsible content 注册为 region，给内部控件一个可说的区域边界。
// English: Collapsible content registers as a region boundary for controls inside.
export function MultimodalCollapsibleContent({
  interactionId,
  interactionLabel,
  interactionHint,
  children,
  ...props
}: MultimodalCollapsibleContentProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="region"
      label={resolveInteractionLabel(interactionLabel, interactionHint, "展开区域")}
      aliases={resolveInteractionAliases(interactionHint)}
    >
      <ShadcnCollapsibleContent {...props}>{children}</ShadcnCollapsibleContent>
    </MultimodalGroup>
  )
}

export { Collapsible }

