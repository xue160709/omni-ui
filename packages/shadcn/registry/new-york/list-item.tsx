"use client"

import * as React from "react"
import { MultimodalGroup, type EntityRef } from "@multimodal-ui/react"

type MultimodalListProps = React.HTMLAttributes<HTMLDivElement> & {
  interactionId: string
  label: string
}

export function MultimodalList({ interactionId, label, children, ...props }: MultimodalListProps) {
  return (
    <MultimodalGroup id={interactionId} role="list" label={label} indexBy="visible_order" {...props}>
      {children}
    </MultimodalGroup>
  )
}

type MultimodalListItemProps = React.HTMLAttributes<HTMLDivElement> & {
  interactionId: string
  label: string
  entity?: EntityRef
}

export function MultimodalListItem({
  interactionId,
  label,
  entity,
  children,
  ...props
}: MultimodalListItemProps) {
  return (
    <MultimodalGroup id={interactionId} role="list_item" label={label} entity={entity} {...props}>
      {children}
    </MultimodalGroup>
  )
}
