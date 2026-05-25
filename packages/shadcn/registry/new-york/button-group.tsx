"use client"

import * as React from "react"
import {
  ButtonGroup as ShadcnButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from "@/components/ui/button-group"
import { MultimodalGroup, type InteractionHint } from "@omni-ui/react"
import { resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalButtonGroupProps = React.ComponentProps<typeof ShadcnButtonGroup> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：ButtonGroup 注册为 button_group，让一组相关按钮获得共同上下文。
// English: ButtonGroup registers as button_group so related buttons share a common context.
export function MultimodalButtonGroup({
  interactionId,
  interactionLabel,
  interactionHint,
  children,
  ...props
}: MultimodalButtonGroupProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="button_group"
      label={resolveInteractionLabel(interactionLabel, interactionHint)}
      aliases={resolveInteractionAliases(interactionHint)}
    >
      <ShadcnButtonGroup {...props}>{children}</ShadcnButtonGroup>
    </MultimodalGroup>
  )
}

export { ButtonGroupSeparator, ButtonGroupText }

