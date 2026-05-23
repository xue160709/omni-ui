"use client"

import * as React from "react"
import { MultimodalGroup, type EntityRef, type InteractionHint } from "@multimodal-ui/react"
import { resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalFormFieldProps = React.HTMLAttributes<HTMLDivElement> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
  label?: string
  entity?: EntityRef
}

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
