"use client"

import * as React from "react"
import { MultimodalGroup, type EntityRef, type InteractionHint } from "@omni-ui/react"
import { resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalFormProps = React.FormHTMLAttributes<HTMLFormElement> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
  label?: string
  entity?: EntityRef
  state?: Record<string, unknown>
}

export function MultimodalForm({
  interactionId,
  interactionLabel,
  interactionHint,
  label,
  entity,
  state,
  children,
  ...props
}: MultimodalFormProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="form"
      label={resolveInteractionLabel(interactionLabel, interactionHint, label)}
      aliases={resolveInteractionAliases(interactionHint)}
      entity={entity}
      state={state}
    >
      <form {...props}>{children}</form>
    </MultimodalGroup>
  )
}

type MultimodalFormSectionProps = React.HTMLAttributes<HTMLDivElement> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
  label?: string
  entity?: EntityRef
  state?: Record<string, unknown>
}

export function MultimodalFormSection({
  interactionId,
  interactionLabel,
  interactionHint,
  label,
  entity,
  state,
  children,
  ...props
}: MultimodalFormSectionProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="form_section"
      label={resolveInteractionLabel(interactionLabel, interactionHint, label)}
      aliases={resolveInteractionAliases(interactionHint)}
      entity={entity}
      state={state}
    >
      <div {...props}>{children}</div>
    </MultimodalGroup>
  )
}

type MultimodalFormActionsProps = React.HTMLAttributes<HTMLDivElement> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export function MultimodalFormActions({
  interactionId = "multimodal.form.actions",
  interactionLabel,
  interactionHint,
  children,
  ...props
}: MultimodalFormActionsProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="form_actions"
      label={resolveInteractionLabel(interactionLabel, interactionHint, "Form actions")}
      aliases={resolveInteractionAliases(interactionHint)}
    >
      <div {...props}>{children}</div>
    </MultimodalGroup>
  )
}
