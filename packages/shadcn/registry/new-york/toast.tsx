"use client"

import * as React from "react"
import { Toaster as ShadcnToaster } from "@/components/ui/toaster"
import { MultimodalGroup, type InteractionHint } from "@omni-ui/react"
import { resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalLegacyToasterProps = React.ComponentProps<typeof ShadcnToaster> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：旧版 Toaster 注册为 toast_region；新项目优先使用 sonner。
// English: Legacy Toaster registers as toast_region; prefer sonner for new projects.
export function MultimodalLegacyToaster({
  interactionId = "multimodal.toast.legacy_region",
  interactionLabel,
  interactionHint,
  ...props
}: MultimodalLegacyToasterProps) {
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

export { toast, useToast } from "@/components/ui/use-toast"

