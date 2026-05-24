"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { MultimodalGroup, type InteractionHint } from "@multimodal-ui/react"
import { resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalDialogContentProps = React.ComponentProps<typeof DialogContent> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Dialog content 注册为 dialog group，runtime 会把它加入 modal-first 上下文。
// English: Dialog content registers as a dialog group, which the runtime adds to the modal-first context.
export function MultimodalDialogContent({
  interactionId,
  interactionLabel,
  interactionHint,
  children,
  ...props
}: MultimodalDialogContentProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="dialog"
      label={resolveInteractionLabel(interactionLabel, interactionHint, "对话框")}
      aliases={resolveInteractionAliases(interactionHint)}
    >
      <DialogContent {...props}>{children}</DialogContent>
    </MultimodalGroup>
  )
}

export {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
}
