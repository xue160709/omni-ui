"use client"

import * as React from "react"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger as ShadcnSheetTrigger,
} from "@/components/ui/sheet"
import {
  MultimodalGroup,
  useInteractionNode,
  type InteractionHint,
} from "@omni-ui/react"
import { composeRefs, resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalSheetTriggerProps = React.ComponentProps<typeof ShadcnSheetTrigger> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Sheet trigger 注册 open/press，覆盖“打开侧边栏/设置面板”这类抽屉入口。
// English: Sheet trigger registers open/press for drawers such as sidebars or settings panels.
export const MultimodalSheetTrigger = React.forwardRef<
  React.ElementRef<typeof ShadcnSheetTrigger>,
  MultimodalSheetTriggerProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnSheetTrigger>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["open", "press"],
    hint: interactionHint,
  })

  return <ShadcnSheetTrigger ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalSheetTrigger.displayName = "MultimodalSheetTrigger"

type MultimodalSheetContentProps = React.ComponentProps<typeof SheetContent> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Sheet content 按 dialog 语义注册，使抽屉打开后进入 modal-first 作用域。
// English: Sheet content registers with dialog semantics so an open drawer enters modal-first scope.
export function MultimodalSheetContent({
  interactionId,
  interactionLabel,
  interactionHint,
  children,
  ...props
}: MultimodalSheetContentProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="dialog"
      label={resolveInteractionLabel(interactionLabel, interactionHint, "面板")}
      aliases={resolveInteractionAliases(interactionHint)}
    >
      <SheetContent {...props}>{children}</SheetContent>
    </MultimodalGroup>
  )
}

export {
  Sheet,
  SheetClose,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
}

