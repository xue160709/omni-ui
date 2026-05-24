"use client"

import * as React from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup as ShadcnSidebarGroup,
  SidebarGroupAction as ShadcnSidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction as ShadcnSidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton as ShadcnSidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton as ShadcnSidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger as ShadcnSidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  MultimodalGroup,
  useInteractionNode,
  type InteractionHint,
} from "@multimodal-ui/react"
import { composeRefs, resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalSidebarTriggerProps = React.ComponentProps<typeof ShadcnSidebarTrigger> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Sidebar trigger 暴露 open/close/toggle，适合应用框架级导航面板。
// English: Sidebar trigger exposes open/close/toggle for app-shell navigation panels.
export const MultimodalSidebarTrigger = React.forwardRef<
  React.ElementRef<typeof ShadcnSidebarTrigger>,
  MultimodalSidebarTriggerProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnSidebarTrigger>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["open", "close", "toggle", "press"],
    hint: interactionHint,
  })

  return <ShadcnSidebarTrigger ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalSidebarTrigger.displayName = "MultimodalSidebarTrigger"

type MultimodalSidebarGroupProps = React.ComponentProps<typeof ShadcnSidebarGroup> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Sidebar group 注册为 navigation_group，让菜单项获得分组上下文。
// English: Sidebar group registers as navigation_group so menu items carry section context.
export function MultimodalSidebarGroup({
  interactionId,
  interactionLabel,
  interactionHint,
  children,
  ...props
}: MultimodalSidebarGroupProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="navigation_group"
      label={resolveInteractionLabel(interactionLabel, interactionHint)}
      aliases={resolveInteractionAliases(interactionHint)}
    >
      <ShadcnSidebarGroup {...props}>{children}</ShadcnSidebarGroup>
    </MultimodalGroup>
  )
}

type MultimodalSidebarMenuButtonProps = React.ComponentProps<typeof ShadcnSidebarMenuButton> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Sidebar menu button 暴露 press，适合“打开设置/去项目”这类导航指令。
// English: Sidebar menu button exposes press for navigation commands such as open settings or go to project.
export const MultimodalSidebarMenuButton = React.forwardRef<
  React.ElementRef<typeof ShadcnSidebarMenuButton>,
  MultimodalSidebarMenuButtonProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnSidebarMenuButton>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["press"],
    hint: interactionHint,
  })

  return <ShadcnSidebarMenuButton ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalSidebarMenuButton.displayName = "MultimodalSidebarMenuButton"

type MultimodalSidebarMenuActionProps = React.ComponentProps<typeof ShadcnSidebarMenuAction> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalSidebarMenuAction = React.forwardRef<
  React.ElementRef<typeof ShadcnSidebarMenuAction>,
  MultimodalSidebarMenuActionProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnSidebarMenuAction>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["press"],
    hint: interactionHint,
  })

  return <ShadcnSidebarMenuAction ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalSidebarMenuAction.displayName = "MultimodalSidebarMenuAction"

type MultimodalSidebarGroupActionProps = React.ComponentProps<typeof ShadcnSidebarGroupAction> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalSidebarGroupAction = React.forwardRef<
  React.ElementRef<typeof ShadcnSidebarGroupAction>,
  MultimodalSidebarGroupActionProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnSidebarGroupAction>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["press"],
    hint: interactionHint,
  })

  return <ShadcnSidebarGroupAction ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalSidebarGroupAction.displayName = "MultimodalSidebarGroupAction"

type MultimodalSidebarMenuSubButtonProps = React.ComponentProps<typeof ShadcnSidebarMenuSubButton> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalSidebarMenuSubButton = React.forwardRef<
  React.ElementRef<typeof ShadcnSidebarMenuSubButton>,
  MultimodalSidebarMenuSubButtonProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnSidebarMenuSubButton>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["press"],
    hint: interactionHint,
  })

  return <ShadcnSidebarMenuSubButton ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalSidebarMenuSubButton.displayName = "MultimodalSidebarMenuSubButton"

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
}

