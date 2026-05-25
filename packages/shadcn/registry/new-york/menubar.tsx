"use client"

import * as React from "react"
import {
  Menubar,
  MenubarCheckboxItem as ShadcnMenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem as ShadcnMenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarPortal,
  MenubarRadioGroup,
  MenubarRadioItem as ShadcnMenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger as ShadcnMenubarSubTrigger,
  MenubarTrigger as ShadcnMenubarTrigger,
} from "@/components/ui/menubar"
import { useInteractionNode, type InteractionHint } from "@omni-ui/react"
import { composeRefs } from "./utils"

type MultimodalMenubarTriggerProps = React.ComponentProps<typeof ShadcnMenubarTrigger> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Menubar trigger 暴露 open/press，适合桌面式菜单栏入口。
// English: Menubar trigger exposes open/press for desktop-style menu bar entries.
export const MultimodalMenubarTrigger = React.forwardRef<
  React.ElementRef<typeof ShadcnMenubarTrigger>,
  MultimodalMenubarTriggerProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnMenubarTrigger>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["open", "press"],
    hint: interactionHint,
  })

  return <ShadcnMenubarTrigger ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalMenubarTrigger.displayName = "MultimodalMenubarTrigger"

type MultimodalMenubarItemProps = React.ComponentProps<typeof ShadcnMenubarItem> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalMenubarItem = React.forwardRef<
  React.ElementRef<typeof ShadcnMenubarItem>,
  MultimodalMenubarItemProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnMenubarItem>>({
    id: interactionId,
    role: "menuitem",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["select", "press"],
    hint: interactionHint,
  })

  return <ShadcnMenubarItem ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalMenubarItem.displayName = "MultimodalMenubarItem"

type MultimodalMenubarCheckboxItemProps = React.ComponentProps<typeof ShadcnMenubarCheckboxItem> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalMenubarCheckboxItem = React.forwardRef<
  React.ElementRef<typeof ShadcnMenubarCheckboxItem>,
  MultimodalMenubarCheckboxItemProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnMenubarCheckboxItem>>({
    id: interactionId,
    role: "menuitemcheckbox",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["toggle", "select", "press"],
    hint: interactionHint,
  })

  return <ShadcnMenubarCheckboxItem ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalMenubarCheckboxItem.displayName = "MultimodalMenubarCheckboxItem"

type MultimodalMenubarRadioItemProps = React.ComponentProps<typeof ShadcnMenubarRadioItem> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalMenubarRadioItem = React.forwardRef<
  React.ElementRef<typeof ShadcnMenubarRadioItem>,
  MultimodalMenubarRadioItemProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnMenubarRadioItem>>({
    id: interactionId,
    role: "menuitemradio",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["select", "press"],
    hint: interactionHint,
  })

  return <ShadcnMenubarRadioItem ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalMenubarRadioItem.displayName = "MultimodalMenubarRadioItem"

type MultimodalMenubarSubTriggerProps = React.ComponentProps<typeof ShadcnMenubarSubTrigger> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalMenubarSubTrigger = React.forwardRef<
  React.ElementRef<typeof ShadcnMenubarSubTrigger>,
  MultimodalMenubarSubTriggerProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnMenubarSubTrigger>>({
    id: interactionId,
    role: "menuitem",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["open", "select", "press"],
    hint: interactionHint,
  })

  return <ShadcnMenubarSubTrigger ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalMenubarSubTrigger.displayName = "MultimodalMenubarSubTrigger"

export {
  Menubar,
  MenubarContent,
  MenubarGroup,
  MenubarLabel,
  MenubarMenu,
  MenubarPortal,
  MenubarRadioGroup,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
}

