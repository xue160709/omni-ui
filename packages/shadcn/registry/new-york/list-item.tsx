"use client"

import * as React from "react"
import { MultimodalGroup, type EntityRef, type InteractionHint } from "@multimodal-ui/react"
import { resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalListProps = React.HTMLAttributes<HTMLDivElement> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
  label?: string
}

export function MultimodalList({
  interactionId,
  interactionLabel,
  interactionHint,
  label,
  children,
  ...props
}: MultimodalListProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="list"
      label={resolveInteractionLabel(interactionLabel, interactionHint, label)}
      aliases={resolveInteractionAliases(interactionHint)}
      indexBy="visible_order"
      {...props}
    >
      {children}
    </MultimodalGroup>
  )
}

type MultimodalListItemProps = React.HTMLAttributes<HTMLDivElement> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
  label?: string
  entity?: EntityRef
}

export function MultimodalListItem({
  interactionId,
  interactionLabel,
  interactionHint,
  label,
  entity,
  children,
  ...props
}: MultimodalListItemProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="list_item"
      label={resolveInteractionLabel(interactionLabel, interactionHint, label)}
      aliases={resolveInteractionAliases(interactionHint)}
      entity={entity}
      {...props}
    >
      {children}
    </MultimodalGroup>
  )
}
