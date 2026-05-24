"use client"

import * as React from "react"
import {
  Card as ShadcnCard,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { MultimodalGroup, type EntityRef, type InteractionHint } from "@multimodal-ui/react"
import { resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalCardProps = React.ComponentProps<typeof ShadcnCard> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
  interactionAliases?: string[]
  entity?: EntityRef
}

// 中文：Card 注册整张卡片为 composite 目标，适合详情卡、统计卡或业务对象卡片。
// English: Card registers the whole card as a composite target for detail, metric, or business-object cards.
export function MultimodalCard({
  interactionId,
  interactionLabel,
  interactionHint,
  interactionAliases,
  entity,
  children,
  ...props
}: MultimodalCardProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="card"
      label={resolveInteractionLabel(interactionLabel, interactionHint)}
      aliases={interactionAliases ?? resolveInteractionAliases(interactionHint)}
      entity={entity}
    >
      <ShadcnCard {...props}>{children}</ShadcnCard>
    </MultimodalGroup>
  )
}

export {
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
}
