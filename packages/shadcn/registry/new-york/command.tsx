"use client"

import * as React from "react"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput as ShadcnCommandInput,
  CommandItem as ShadcnCommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { MultimodalGroup, useInteractionNode, type InteractionHint } from "@multimodal-ui/react"
import { composeRefs, resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalCommandProps = React.ComponentProps<typeof Command> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export function MultimodalCommand({
  interactionId,
  interactionLabel,
  interactionHint,
  children,
  ...props
}: MultimodalCommandProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="command"
      label={resolveInteractionLabel(interactionLabel, interactionHint, "命令菜单")}
      aliases={resolveInteractionAliases(interactionHint)}
    >
      <Command {...props}>{children}</Command>
    </MultimodalGroup>
  )
}

type MultimodalCommandInputProps = React.ComponentProps<typeof ShadcnCommandInput> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalCommandInput = React.forwardRef<
  React.ElementRef<typeof ShadcnCommandInput>,
  MultimodalCommandInputProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnCommandInput>>({
    id: interactionId,
    role: "textbox",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["focus", "search", "clear"],
    hint: interactionHint,
  })

  return <ShadcnCommandInput ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalCommandInput.displayName = "MultimodalCommandInput"

type MultimodalCommandItemProps = React.ComponentProps<typeof ShadcnCommandItem> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalCommandItem = React.forwardRef<
  React.ElementRef<typeof ShadcnCommandItem>,
  MultimodalCommandItemProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnCommandItem>>({
    id: interactionId,
    role: "command_item",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["selectResult", "select"],
    hint: interactionHint,
  })

  return <ShadcnCommandItem ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalCommandItem.displayName = "MultimodalCommandItem"

export {
  CommandEmpty,
  CommandGroup,
  CommandList,
  CommandSeparator,
  CommandShortcut,
}
