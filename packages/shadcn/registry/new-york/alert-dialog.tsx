"use client"

import * as React from "react"
import {
  AlertDialog,
  AlertDialogAction as ShadcnAlertDialogAction,
  AlertDialogCancel as ShadcnAlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  MultimodalGroup,
  useInteractionNode,
  type InteractionHint,
} from "@omni-ui/react"
import { composeRefs, resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalAlertDialogContentProps = React.ComponentProps<typeof AlertDialogContent> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：AlertDialog content 注册为 alertdialog，让运行时优先处理确认/取消语境。
// English: AlertDialog content registers as alertdialog so the runtime prioritizes confirm/cancel context.
export function MultimodalAlertDialogContent({
  interactionId,
  interactionLabel,
  interactionHint,
  children,
  ...props
}: MultimodalAlertDialogContentProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="alertdialog"
      label={resolveInteractionLabel(interactionLabel, interactionHint, "确认对话框")}
      aliases={resolveInteractionAliases(interactionHint)}
    >
      <AlertDialogContent {...props}>{children}</AlertDialogContent>
    </MultimodalGroup>
  )
}

type MultimodalAlertDialogActionProps = React.ComponentProps<typeof ShadcnAlertDialogAction> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：确认按钮暴露 confirm/press，兼容“确认”“继续”“点确定”等表达。
// English: The action button exposes confirm/press for phrases like confirm, continue, or click OK.
export const MultimodalAlertDialogAction = React.forwardRef<
  React.ElementRef<typeof ShadcnAlertDialogAction>,
  MultimodalAlertDialogActionProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnAlertDialogAction>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["confirm", "press"],
    hint: interactionHint,
  })

  return <ShadcnAlertDialogAction ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalAlertDialogAction.displayName = "MultimodalAlertDialogAction"

type MultimodalAlertDialogCancelProps = React.ComponentProps<typeof ShadcnAlertDialogCancel> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：取消按钮暴露 cancel/press，便于模型和规则区分确认与放弃。
// English: The cancel button exposes cancel/press so resolvers can distinguish accept from dismiss.
export const MultimodalAlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof ShadcnAlertDialogCancel>,
  MultimodalAlertDialogCancelProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnAlertDialogCancel>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["cancel", "press"],
    hint: interactionHint,
  })

  return <ShadcnAlertDialogCancel ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalAlertDialogCancel.displayName = "MultimodalAlertDialogCancel"

export {
  AlertDialog,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
}

