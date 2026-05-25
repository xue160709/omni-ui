"use client"

import * as React from "react"
import { MultimodalGroup, type EntityRef, type InteractionHint } from "@omni-ui/react"
import { resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalFormFieldProps = React.HTMLAttributes<HTMLDivElement> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
  label?: string
  entity?: EntityRef
}

// 中文：FormField 把 label、control、message 包成一个对象，便于“清空邮箱字段”这类命令定位。
// English: FormField wraps label, control, and message into one object for commands such as clearing an email field.
export function MultimodalFormField({
  interactionId,
  interactionLabel,
  interactionHint,
  label,
  entity,
  children,
  ...props
}: MultimodalFormFieldProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="form_field"
      label={resolveInteractionLabel(interactionLabel, interactionHint, label)}
      aliases={resolveInteractionAliases(interactionHint)}
      entity={entity}
      {...props}
    >
      {children}
    </MultimodalGroup>
  )
}
