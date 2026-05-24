"use client"

import * as React from "react"
import {
  Accordion,
  AccordionContent as ShadcnAccordionContent,
  AccordionItem,
  AccordionTrigger as ShadcnAccordionTrigger,
} from "@/components/ui/accordion"
import {
  MultimodalGroup,
  useInteractionNode,
  type InteractionHint,
} from "@multimodal-ui/react"
import { composeRefs, resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalAccordionTriggerProps = React.ComponentProps<typeof ShadcnAccordionTrigger> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Accordion trigger 暴露 open/close/toggle，支持“展开第二节/收起详情”。
// English: Accordion trigger exposes open/close/toggle for expanding or collapsing sections.
export const MultimodalAccordionTrigger = React.forwardRef<
  React.ElementRef<typeof ShadcnAccordionTrigger>,
  MultimodalAccordionTriggerProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnAccordionTrigger>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["open", "close", "toggle", "press"],
    hint: interactionHint,
  })

  return <ShadcnAccordionTrigger ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalAccordionTrigger.displayName = "MultimodalAccordionTrigger"

type MultimodalAccordionContentProps = React.ComponentProps<typeof ShadcnAccordionContent> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Accordion content 注册为 region，让展开内容成为可引用的局部区域。
// English: Accordion content registers as a region so expanded content can be referenced locally.
export function MultimodalAccordionContent({
  interactionId,
  interactionLabel,
  interactionHint,
  children,
  ...props
}: MultimodalAccordionContentProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="region"
      label={resolveInteractionLabel(interactionLabel, interactionHint, "折叠内容")}
      aliases={resolveInteractionAliases(interactionHint)}
    >
      <ShadcnAccordionContent {...props}>{children}</ShadcnAccordionContent>
    </MultimodalGroup>
  )
}

export { Accordion, AccordionItem }

