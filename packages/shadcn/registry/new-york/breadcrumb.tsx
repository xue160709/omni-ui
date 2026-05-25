"use client"

import * as React from "react"
import {
  Breadcrumb,
  BreadcrumbEllipsis as ShadcnBreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink as ShadcnBreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useInteractionNode, type InteractionHint } from "@omni-ui/react"
import { composeRefs } from "./utils"

type MultimodalBreadcrumbLinkProps = React.ComponentProps<typeof ShadcnBreadcrumbLink> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Breadcrumb link 注册为 link，支持“回到上一级/打开项目页”等层级导航。
// English: Breadcrumb link registers as a link for hierarchy navigation commands.
export const MultimodalBreadcrumbLink = React.forwardRef<
  React.ElementRef<typeof ShadcnBreadcrumbLink>,
  MultimodalBreadcrumbLinkProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnBreadcrumbLink>>({
    id: interactionId,
    role: "link",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["press"],
    hint: interactionHint,
  })

  return <ShadcnBreadcrumbLink ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalBreadcrumbLink.displayName = "MultimodalBreadcrumbLink"

type MultimodalBreadcrumbEllipsisProps = React.ComponentProps<typeof ShadcnBreadcrumbEllipsis> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Breadcrumb ellipsis 暴露 open/press，用于打开被折叠的层级。
// English: Breadcrumb ellipsis exposes open/press for collapsed hierarchy items.
export const MultimodalBreadcrumbEllipsis = React.forwardRef<
  React.ElementRef<typeof ShadcnBreadcrumbEllipsis>,
  MultimodalBreadcrumbEllipsisProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnBreadcrumbEllipsis>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["open", "press"],
    hint: interactionHint,
  })

  return <ShadcnBreadcrumbEllipsis ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalBreadcrumbEllipsis.displayName = "MultimodalBreadcrumbEllipsis"

export {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
}

