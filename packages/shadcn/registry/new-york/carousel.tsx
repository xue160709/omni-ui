"use client"

import * as React from "react"
import {
  Carousel as ShadcnCarousel,
  CarouselContent,
  CarouselItem as ShadcnCarouselItem,
  CarouselNext as ShadcnCarouselNext,
  CarouselPrevious as ShadcnCarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel"
import {
  MultimodalGroup,
  useInteractionNode,
  type InteractionHint,
} from "@omni-ui/react"
import { composeRefs, resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalCarouselProps = React.ComponentProps<typeof ShadcnCarousel> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Carousel 作为语义容器，具体上一张/下一张按钮使用 press primitive。
// English: Carousel is a semantic container; previous/next controls use the press primitive.
export function MultimodalCarousel({
  interactionId,
  interactionLabel,
  interactionHint,
  children,
  ...props
}: MultimodalCarouselProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="carousel"
      label={resolveInteractionLabel(interactionLabel, interactionHint, "轮播")}
      aliases={resolveInteractionAliases(interactionHint)}
      state={{ orientation: props.orientation }}
    >
      <ShadcnCarousel {...props}>{children}</ShadcnCarousel>
    </MultimodalGroup>
  )
}

type MultimodalCarouselItemProps = React.ComponentProps<typeof ShadcnCarouselItem> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
  index?: number
}

// 中文：Carousel item 注册为 carousel_item，便于按序号或标题定位某张内容。
// English: Carousel item registers as carousel_item so slides can be targeted by order or label.
export function MultimodalCarouselItem({
  interactionId,
  interactionLabel,
  interactionHint,
  index,
  children,
  ...props
}: MultimodalCarouselItemProps) {
  const aliases = [...(resolveInteractionAliases(interactionHint) ?? [])]
  if (index) aliases.push(`第 ${index} 张`, `第${index}张`, `第 ${index} 个`, `第${index}个`)

  return (
    <MultimodalGroup
      id={interactionId}
      role="carousel_item"
      label={resolveInteractionLabel(interactionLabel, interactionHint)}
      aliases={aliases}
      state={index ? { index } : undefined}
    >
      <ShadcnCarouselItem {...props}>{children}</ShadcnCarouselItem>
    </MultimodalGroup>
  )
}

type MultimodalCarouselPreviousProps = React.ComponentProps<typeof ShadcnCarouselPrevious> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalCarouselPrevious = React.forwardRef<
  React.ElementRef<typeof ShadcnCarouselPrevious>,
  MultimodalCarouselPreviousProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnCarouselPrevious>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["press"],
    hint: interactionHint,
  })

  return <ShadcnCarouselPrevious ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalCarouselPrevious.displayName = "MultimodalCarouselPrevious"

type MultimodalCarouselNextProps = React.ComponentProps<typeof ShadcnCarouselNext> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalCarouselNext = React.forwardRef<
  React.ElementRef<typeof ShadcnCarouselNext>,
  MultimodalCarouselNextProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnCarouselNext>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["press"],
    hint: interactionHint,
  })

  return <ShadcnCarouselNext ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalCarouselNext.displayName = "MultimodalCarouselNext"

export { CarouselContent, type CarouselApi }
