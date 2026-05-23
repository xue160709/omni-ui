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
