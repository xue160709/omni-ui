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

// 中文：Command group 表达整个命令面板的语义边界，便于搜索框和结果项归属同一上下文。
// English: Command group defines the command palette boundary so the search box and results share one context.
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

// 中文：Command input 使用 search 语义，和普通文本输入区分开。
// English: Command input uses search semantics to distinguish it from generic text editing.
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

// 中文：Command item 暴露 selectResult/select，表示选择搜索或命令结果。
// English: Command item exposes selectResult/select to represent choosing a search or command result.
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
