"use client"

import * as React from "react"
import { Toaster as ShadcnToaster } from "@/components/ui/sonner"
import { MultimodalGroup, type InteractionHint } from "@multimodal-ui/react"
import { resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalToasterProps = React.ComponentProps<typeof ShadcnToaster> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export function MultimodalToaster({
  interactionId = "multimodal.toast.region",
  interactionLabel,
  interactionHint,
  ...props
}: MultimodalToasterProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="toast_region"
      label={resolveInteractionLabel(interactionLabel, interactionHint, "通知")}
      aliases={resolveInteractionAliases(interactionHint)}
    >
      <ShadcnToaster {...props} />
    </MultimodalGroup>
  )
}
