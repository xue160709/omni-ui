"use client"

import * as React from "react"
import {
  Alert as ShadcnAlert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { MultimodalGroup, type InteractionHint } from "@multimodal-ui/react"
import { resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalAlertProps = React.ComponentProps<typeof ShadcnAlert> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Alert 注册为 alert 区域，让助手能解释当前警告、错误或成功提示。
// English: Alert registers as an alert region so assistants can describe current warnings, errors, or success states.
export function MultimodalAlert({
  interactionId,
  interactionLabel,
  interactionHint,
  children,
  ...props
}: MultimodalAlertProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="alert"
      label={resolveInteractionLabel(interactionLabel, interactionHint)}
      aliases={resolveInteractionAliases(interactionHint)}
    >
      <ShadcnAlert {...props}>{children}</ShadcnAlert>
    </MultimodalGroup>
  )
}

export { AlertAction, AlertDescription, AlertTitle }

