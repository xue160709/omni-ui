"use client"

import * as React from "react"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink as ShadcnNavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger as ShadcnNavigationMenuTrigger,
  NavigationMenuViewport,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"
import { useInteractionNode, type InteractionHint } from "@omni-ui/react"
import { composeRefs } from "./utils"

type MultimodalNavigationMenuTriggerProps = React.ComponentProps<typeof ShadcnNavigationMenuTrigger> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：NavigationMenu trigger 注册 open/press，支持“打开产品菜单”等导航分组。
// English: NavigationMenu trigger registers open/press for navigation groups such as product menus.
export const MultimodalNavigationMenuTrigger = React.forwardRef<
  React.ElementRef<typeof ShadcnNavigationMenuTrigger>,
  MultimodalNavigationMenuTriggerProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnNavigationMenuTrigger>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["open", "press"],
    hint: interactionHint,
  })

  return <ShadcnNavigationMenuTrigger ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalNavigationMenuTrigger.displayName = "MultimodalNavigationMenuTrigger"

type MultimodalNavigationMenuLinkProps = React.ComponentProps<typeof ShadcnNavigationMenuLink> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalNavigationMenuLink = React.forwardRef<
  React.ElementRef<typeof ShadcnNavigationMenuLink>,
  MultimodalNavigationMenuLinkProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnNavigationMenuLink>>({
    id: interactionId,
    role: "link",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["press"],
    hint: interactionHint,
  })

  return <ShadcnNavigationMenuLink ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalNavigationMenuLink.displayName = "MultimodalNavigationMenuLink"

export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuViewport,
  navigationMenuTriggerStyle,
}

