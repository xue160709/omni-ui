"use client"

import * as React from "react"
import { MultimodalGroup, type EntityRef, type InteractionHint } from "@omni-ui/react"
import { resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalListProps = React.HTMLAttributes<HTMLDivElement> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
  label?: string
}

// 中文：List 开启 visible_order 索引，让列表项自动获得“第几个”的别名。
// English: List enables visible_order indexing so items automatically gain "nth item" aliases.
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

// 中文：ListItem 可挂 entity，让业务 action 能按实体类型绑定到整行对象。
// English: ListItem can carry an entity so domain actions attach to the whole row by entity type.
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
