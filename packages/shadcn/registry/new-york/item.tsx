"use client"

import * as React from "react"
import {
  Item as ShadcnItem,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup as ShadcnItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item"
import { MultimodalGroup, type EntityRef, type InteractionHint } from "@omni-ui/react"
import { resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalItemGroupProps = React.ComponentProps<typeof ShadcnItemGroup> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：ItemGroup 注册为 list，提供可见序号别名，支持“打开第二项”。
// English: ItemGroup registers as a list with visible-order aliases for commands like open the second item.
export function MultimodalItemGroup({
  interactionId,
  interactionLabel,
  interactionHint,
  children,
  ...props
}: MultimodalItemGroupProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="list"
      label={resolveInteractionLabel(interactionLabel, interactionHint)}
      aliases={resolveInteractionAliases(interactionHint)}
      indexBy="visible_order"
    >
      <ShadcnItemGroup {...props}>{children}</ShadcnItemGroup>
    </MultimodalGroup>
  )
}

type MultimodalItemProps = React.ComponentProps<typeof ShadcnItem> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
  entity?: EntityRef
  state?: Record<string, unknown>
}

// 中文：Item 注册为 list_item，适合内容、媒体和动作组成的业务条目。
// English: Item registers as list_item for business items composed of content, media, and actions.
export function MultimodalItem({
  interactionId,
  interactionLabel,
  interactionHint,
  entity,
  state,
  children,
  ...props
}: MultimodalItemProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="list_item"
      label={resolveInteractionLabel(interactionLabel, interactionHint)}
      aliases={resolveInteractionAliases(interactionHint)}
      entity={entity}
      state={state}
    >
      <ShadcnItem {...props}>{children}</ShadcnItem>
    </MultimodalGroup>
  )
}

export {
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
}

