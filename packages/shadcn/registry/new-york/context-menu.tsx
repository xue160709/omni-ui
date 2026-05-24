"use client"

import * as React from "react"
import {
  ContextMenu,
  ContextMenuCheckboxItem as ShadcnContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem as ShadcnContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem as ShadcnContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger as ShadcnContextMenuSubTrigger,
  ContextMenuTrigger as ShadcnContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useInteractionNode, type InteractionHint } from "@multimodal-ui/react"
import { composeRefs } from "./utils"

type MultimodalContextMenuTriggerProps = React.ComponentProps<typeof ShadcnContextMenuTrigger> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：ContextMenu trigger 注册 open，让“打开这块区域的上下文菜单”可被定位。
// English: ContextMenu trigger registers open so a region's context menu can be targeted.
export const MultimodalContextMenuTrigger = React.forwardRef<
  React.ElementRef<typeof ShadcnContextMenuTrigger>,
  MultimodalContextMenuTriggerProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnContextMenuTrigger>>({
    id: interactionId,
    role: "context_menu_trigger",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["open"],
    hint: interactionHint,
  })

  return <ShadcnContextMenuTrigger ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalContextMenuTrigger.displayName = "MultimodalContextMenuTrigger"

type MultimodalContextMenuItemProps = React.ComponentProps<typeof ShadcnContextMenuItem> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：ContextMenu item 注册为 menuitem，适合菜单打开后按文字选择命令。
// English: ContextMenu item registers as menuitem for selecting visible context commands.
export const MultimodalContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ShadcnContextMenuItem>,
  MultimodalContextMenuItemProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnContextMenuItem>>({
    id: interactionId,
    role: "menuitem",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["select", "press"],
    hint: interactionHint,
  })

  return <ShadcnContextMenuItem ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalContextMenuItem.displayName = "MultimodalContextMenuItem"

type MultimodalContextMenuCheckboxItemProps = React.ComponentProps<typeof ShadcnContextMenuCheckboxItem> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalContextMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof ShadcnContextMenuCheckboxItem>,
  MultimodalContextMenuCheckboxItemProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnContextMenuCheckboxItem>>({
    id: interactionId,
    role: "menuitemcheckbox",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["toggle", "select", "press"],
    hint: interactionHint,
  })

  return <ShadcnContextMenuCheckboxItem ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalContextMenuCheckboxItem.displayName = "MultimodalContextMenuCheckboxItem"

type MultimodalContextMenuRadioItemProps = React.ComponentProps<typeof ShadcnContextMenuRadioItem> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalContextMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof ShadcnContextMenuRadioItem>,
  MultimodalContextMenuRadioItemProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnContextMenuRadioItem>>({
    id: interactionId,
    role: "menuitemradio",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["select", "press"],
    hint: interactionHint,
  })

  return <ShadcnContextMenuRadioItem ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalContextMenuRadioItem.displayName = "MultimodalContextMenuRadioItem"

type MultimodalContextMenuSubTriggerProps = React.ComponentProps<typeof ShadcnContextMenuSubTrigger> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalContextMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof ShadcnContextMenuSubTrigger>,
  MultimodalContextMenuSubTriggerProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnContextMenuSubTrigger>>({
    id: interactionId,
    role: "menuitem",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["open", "select", "press"],
    hint: interactionHint,
  })

  return <ShadcnContextMenuSubTrigger ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalContextMenuSubTrigger.displayName = "MultimodalContextMenuSubTrigger"

export {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
}

