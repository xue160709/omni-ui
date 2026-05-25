"use client"

import * as React from "react"
import {
  Empty as ShadcnEmpty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { MultimodalGroup, type InteractionHint } from "@omni-ui/react"
import { resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalEmptyProps = React.ComponentProps<typeof ShadcnEmpty> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Empty 注册为空状态区域，让助手能说明当前为什么没有数据以及有哪些后续动作。
// English: Empty registers as an empty_state region so assistants can explain why there is no data and what actions are available.
export function MultimodalEmpty({
  interactionId,
  interactionLabel,
  interactionHint,
  children,
  ...props
}: MultimodalEmptyProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="empty_state"
      label={resolveInteractionLabel(interactionLabel, interactionHint, "空状态")}
      aliases={resolveInteractionAliases(interactionHint)}
    >
      <ShadcnEmpty {...props}>{children}</ShadcnEmpty>
    </MultimodalGroup>
  )
}

export {
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
}

