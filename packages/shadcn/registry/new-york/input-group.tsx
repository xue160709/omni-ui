"use client"

import * as React from "react"
import {
  InputGroup as ShadcnInputGroup,
  InputGroupAddon,
  InputGroupButton as ShadcnInputGroupButton,
  InputGroupInput as ShadcnInputGroupInput,
  InputGroupText,
  InputGroupTextarea as ShadcnInputGroupTextarea,
} from "@/components/ui/input-group"
import {
  MultimodalGroup,
  useInteractionNode,
  type InteractionHint,
} from "@omni-ui/react"
import { composeRefs, resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalInputGroupProps = React.ComponentProps<typeof ShadcnInputGroup> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：InputGroup 注册为 form_field，适合搜索框、金额输入、带按钮输入等组合控件。
// English: InputGroup registers as form_field for search, amount, and input-with-action compositions.
export function MultimodalInputGroup({
  interactionId,
  interactionLabel,
  interactionHint,
  children,
  ...props
}: MultimodalInputGroupProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="form_field"
      label={resolveInteractionLabel(interactionLabel, interactionHint)}
      aliases={resolveInteractionAliases(interactionHint)}
    >
      <ShadcnInputGroup {...props}>{children}</ShadcnInputGroup>
    </MultimodalGroup>
  )
}

type MultimodalInputGroupInputProps = React.ComponentProps<typeof ShadcnInputGroupInput> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalInputGroupInput = React.forwardRef<
  React.ElementRef<typeof ShadcnInputGroupInput>,
  MultimodalInputGroupInputProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnInputGroupInput>>({
    id: interactionId,
    role: "textbox",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["focus", "setText", "appendText", "clear"],
    hint: interactionHint,
  })

  return <ShadcnInputGroupInput ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalInputGroupInput.displayName = "MultimodalInputGroupInput"

type MultimodalInputGroupTextareaProps = React.ComponentProps<typeof ShadcnInputGroupTextarea> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalInputGroupTextarea = React.forwardRef<
  React.ElementRef<typeof ShadcnInputGroupTextarea>,
  MultimodalInputGroupTextareaProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnInputGroupTextarea>>({
    id: interactionId,
    role: "textbox",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["focus", "setText", "appendText", "clear"],
    hint: interactionHint,
  })

  return <ShadcnInputGroupTextarea ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalInputGroupTextarea.displayName = "MultimodalInputGroupTextarea"

type MultimodalInputGroupButtonProps = React.ComponentProps<typeof ShadcnInputGroupButton> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalInputGroupButton = React.forwardRef<
  React.ElementRef<typeof ShadcnInputGroupButton>,
  MultimodalInputGroupButtonProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnInputGroupButton>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["press"],
    hint: interactionHint,
  })

  return <ShadcnInputGroupButton ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalInputGroupButton.displayName = "MultimodalInputGroupButton"

export { InputGroupAddon, InputGroupText }

