"use client"

import * as React from "react"
import { Button as ShadcnButton } from "@/components/ui/button"
import { Popover } from "@/components/ui/popover"
import {
  CommandEmpty,
  CommandGroup,
  CommandList,
  MultimodalCommand,
  MultimodalCommandInput,
  MultimodalCommandItem,
} from "./command"
import { MultimodalPopoverContent, MultimodalPopoverTrigger } from "./popover"
import { resolveInteractionAliases, resolveInteractionLabel } from "./utils"
import { MultimodalGroup, type InteractionHint } from "@omni-ui/react"

export type MultimodalComboboxOption = {
  value: string
  label: string
  aliases?: string[]
  disabled?: boolean
}

type MultimodalComboboxProps = {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
  options: MultimodalComboboxOption[]
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyLabel?: string
  buttonClassName?: string
  contentClassName?: string
}

// 中文：Combobox 是 Popover + Command 的常用组合，提供可搜索、可按结果选择的整体语义。
// English: Combobox composes Popover and Command into searchable, selectable result semantics.
export function MultimodalCombobox({
  interactionId,
  interactionLabel,
  interactionHint,
  options,
  value,
  onValueChange,
  placeholder = "Select option",
  searchPlaceholder = "Search...",
  emptyLabel = "No results.",
  buttonClassName,
  contentClassName,
}: MultimodalComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const selected = options.find((option) => option.value === value)
  const label = resolveInteractionLabel(interactionLabel, interactionHint, placeholder)

  return (
    <MultimodalGroup
      id={interactionId}
      role="combobox"
      label={label}
      aliases={resolveInteractionAliases(interactionHint)}
      state={{ open, value, selectedLabel: selected?.label }}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <MultimodalPopoverTrigger
          asChild
          interactionId={`${interactionId}.trigger`}
          interactionLabel={label}
        >
          <ShadcnButton
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={buttonClassName}
          >
            {selected?.label ?? placeholder}
          </ShadcnButton>
        </MultimodalPopoverTrigger>
        <MultimodalPopoverContent
          interactionId={`${interactionId}.content`}
          interactionLabel={label}
          className={contentClassName}
        >
          <MultimodalCommand interactionId={`${interactionId}.command`} interactionLabel={label}>
            <MultimodalCommandInput
              interactionId={`${interactionId}.search`}
              interactionLabel={`${label} search`}
              placeholder={searchPlaceholder}
            />
            <CommandList>
              <CommandEmpty>{emptyLabel}</CommandEmpty>
              <CommandGroup>
                {options.map((option, index) => (
                  <MultimodalCommandItem
                    key={option.value}
                    value={option.label}
                    disabled={option.disabled}
                    interactionId={`${interactionId}.option.${option.value}`}
                    interactionLabel={option.label}
                    interactionHint={{ aliases: [...(option.aliases ?? []), `第 ${index + 1} 个`, `第${index + 1}个`] }}
                    onSelect={() => {
                      onValueChange?.(option.value)
                      setOpen(false)
                    }}
                  >
                    {option.label}
                  </MultimodalCommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </MultimodalCommand>
        </MultimodalPopoverContent>
      </Popover>
    </MultimodalGroup>
  )
}

