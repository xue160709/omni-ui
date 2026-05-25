"use client"

import * as React from "react"
import { Toaster as ShadcnToaster } from "@/components/ui/sonner"
import { MultimodalGroup, type InteractionHint } from "@omni-ui/react"
import { resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalToasterProps = React.ComponentProps<typeof ShadcnToaster> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Toaster 注册为 toast_region，让助手能描述或定位当前通知区域。
// English: Toaster registers as a toast_region so assistants can describe or target the notification area.
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
