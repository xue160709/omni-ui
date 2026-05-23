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
import { MultimodalGroup } from "@multimodal-ui/react"

type MultimodalDialogContentProps = React.ComponentProps<typeof DialogContent> & {
  interactionId: string
  interactionLabel?: string
}

export function MultimodalDialogContent({
  interactionId,
  interactionLabel = "对话框",
  children,
  ...props
}: MultimodalDialogContentProps) {
  return (
    <MultimodalGroup id={interactionId} role="dialog" label={interactionLabel}>
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
