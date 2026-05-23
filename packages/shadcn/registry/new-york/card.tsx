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
