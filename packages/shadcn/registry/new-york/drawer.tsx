"use client"

import * as React from "react"
import {
  Drawer,
  DrawerClose as ShadcnDrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger as ShadcnDrawerTrigger,
} from "@/components/ui/drawer"
import {
  MultimodalGroup,
  useInteractionNode,
  type InteractionHint,
} from "@multimodal-ui/react"
import { composeRefs, resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalDrawerTriggerProps = React.ComponentProps<typeof ShadcnDrawerTrigger> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Drawer trigger 注册 open/press，覆盖移动端常见的底部抽屉入口。
// English: Drawer trigger registers open/press for common mobile bottom-drawer entry points.
export const MultimodalDrawerTrigger = React.forwardRef<
  React.ElementRef<typeof ShadcnDrawerTrigger>,
  MultimodalDrawerTriggerProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnDrawerTrigger>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["open", "press"],
    hint: interactionHint,
  })

  return <ShadcnDrawerTrigger ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalDrawerTrigger.displayName = "MultimodalDrawerTrigger"

type MultimodalDrawerContentProps = React.ComponentProps<typeof DrawerContent> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Drawer content 按 dialog 语义注册，打开后进入局部/模态优先上下文。
// English: Drawer content registers with dialog semantics so an open drawer gets local modal-first context.
export function MultimodalDrawerContent({
  interactionId,
  interactionLabel,
  interactionHint,
  children,
  ...props
}: MultimodalDrawerContentProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="dialog"
      label={resolveInteractionLabel(interactionLabel, interactionHint, "抽屉")}
      aliases={resolveInteractionAliases(interactionHint)}
    >
      <DrawerContent {...props}>{children}</DrawerContent>
    </MultimodalGroup>
  )
}

type MultimodalDrawerCloseProps = React.ComponentProps<typeof ShadcnDrawerClose> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Drawer close 暴露 close/press，便于“关闭抽屉/收起面板”。
// English: Drawer close exposes close/press for commands such as close the drawer.
export const MultimodalDrawerClose = React.forwardRef<
  React.ElementRef<typeof ShadcnDrawerClose>,
  MultimodalDrawerCloseProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnDrawerClose>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["close", "press"],
    hint: interactionHint,
  })

  return <ShadcnDrawerClose ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalDrawerClose.displayName = "MultimodalDrawerClose"

export {
  Drawer,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
}

