"use client"

import * as React from "react"
import { MultimodalGroup, type EntityRef } from "@multimodal-ui/react"

type MultimodalFormFieldProps = React.HTMLAttributes<HTMLDivElement> & {
  interactionId: string
  label: string
  entity?: EntityRef
}

export function MultimodalFormField({
  interactionId,
  label,
  entity,
  children,
  ...props
}: MultimodalFormFieldProps) {
  return (
    <MultimodalGroup id={interactionId} role="form_field" label={label} entity={entity} {...props}>
      {children}
    </MultimodalGroup>
  )
}
