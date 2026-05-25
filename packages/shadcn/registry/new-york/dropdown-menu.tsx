"use client"

import * as React from "react"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem as ShadcnDropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem as ShadcnDropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem as ShadcnDropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger as ShadcnDropdownMenuSubTrigger,
  DropdownMenuTrigger as ShadcnDropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useInteractionNode, type InteractionHint } from "@omni-ui/react"
import { composeRefs } from "./utils"

type MultimodalDropdownMenuTriggerProps = React.ComponentProps<typeof ShadcnDropdownMenuTrigger> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Dropdown trigger 既可 open 也可 press，兼容“打开菜单”和“点菜单按钮”两类表达。
// English: Dropdown trigger supports both open and press for commands like "open the menu" or "click the menu button".
export const MultimodalDropdownMenuTrigger = React.forwardRef<
  React.ElementRef<typeof ShadcnDropdownMenuTrigger>,
  MultimodalDropdownMenuTriggerProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnDropdownMenuTrigger>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["open", "press"],
    hint: interactionHint,
  })

  return <ShadcnDropdownMenuTrigger ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalDropdownMenuTrigger.displayName = "MultimodalDropdownMenuTrigger"

type MultimodalDropdownMenuItemProps = React.ComponentProps<typeof ShadcnDropdownMenuItem> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Dropdown item 注册为 menuitem，适合菜单打开后按文字选择命令。
// English: Dropdown item registers as a menuitem so commands can select visible menu entries by text.
export const MultimodalDropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof ShadcnDropdownMenuItem>,
  MultimodalDropdownMenuItemProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnDropdownMenuItem>>({
    id: interactionId,
    role: "menuitem",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["select", "press"],
    hint: interactionHint,
  })

  return <ShadcnDropdownMenuItem ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalDropdownMenuItem.displayName = "MultimodalDropdownMenuItem"

type MultimodalDropdownMenuCheckboxItemProps = React.ComponentProps<typeof ShadcnDropdownMenuCheckboxItem> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Checkbox menu item 暴露 toggle/select，适合“开启显示已完成”这类菜单项。
// English: Checkbox menu item exposes toggle/select for menu options such as showing completed items.
export const MultimodalDropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof ShadcnDropdownMenuCheckboxItem>,
  MultimodalDropdownMenuCheckboxItemProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnDropdownMenuCheckboxItem>>({
    id: interactionId,
    role: "menuitemcheckbox",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["toggle", "select", "press"],
    hint: interactionHint,
  })

  return <ShadcnDropdownMenuCheckboxItem ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalDropdownMenuCheckboxItem.displayName = "MultimodalDropdownMenuCheckboxItem"

type MultimodalDropdownMenuRadioItemProps = React.ComponentProps<typeof ShadcnDropdownMenuRadioItem> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Radio menu item 暴露 select，适合菜单中的互斥选项。
// English: Radio menu item exposes select for mutually exclusive menu options.
export const MultimodalDropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof ShadcnDropdownMenuRadioItem>,
  MultimodalDropdownMenuRadioItemProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnDropdownMenuRadioItem>>({
    id: interactionId,
    role: "menuitemradio",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["select", "press"],
    hint: interactionHint,
  })

  return <ShadcnDropdownMenuRadioItem ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalDropdownMenuRadioItem.displayName = "MultimodalDropdownMenuRadioItem"

type MultimodalDropdownMenuSubTriggerProps = React.ComponentProps<typeof ShadcnDropdownMenuSubTrigger> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Sub trigger 暴露 open/select，用于“打开更多排序方式”这类二级菜单。
// English: Sub trigger exposes open/select for nested menus such as more sorting options.
export const MultimodalDropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof ShadcnDropdownMenuSubTrigger>,
  MultimodalDropdownMenuSubTriggerProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnDropdownMenuSubTrigger>>({
    id: interactionId,
    role: "menuitem",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["open", "select", "press"],
    hint: interactionHint,
  })

  return <ShadcnDropdownMenuSubTrigger ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalDropdownMenuSubTrigger.displayName = "MultimodalDropdownMenuSubTrigger"

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
}
