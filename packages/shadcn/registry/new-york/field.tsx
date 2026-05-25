"use client"

import * as React from "react"
import {
  Field as ShadcnField,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import { MultimodalGroup, type InteractionHint } from "@omni-ui/react"
import { resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalFieldProps = React.ComponentProps<typeof ShadcnField> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Field 注册为 form_field，和新版 shadcn Field/Label/Description 结构对齐。
// English: Field registers as form_field, matching newer shadcn Field/Label/Description structures.
export function MultimodalField({
  interactionId,
  interactionLabel,
  interactionHint,
  children,
  ...props
}: MultimodalFieldProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="form_field"
      label={resolveInteractionLabel(interactionLabel, interactionHint)}
      aliases={resolveInteractionAliases(interactionHint)}
    >
      <ShadcnField {...props}>{children}</ShadcnField>
    </MultimodalGroup>
  )
}

export {
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
}

