"use client"

import * as React from "react"
import { Button as ShadcnButton } from "@/components/ui/button"
import { Calendar as ShadcnCalendar } from "@/components/ui/calendar"
import { Popover } from "@/components/ui/popover"
import { MultimodalGroup, type InteractionHint } from "@multimodal-ui/react"
import { MultimodalPopoverContent, MultimodalPopoverTrigger } from "./popover"
import { resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type CalendarProps = React.ComponentProps<typeof ShadcnCalendar>

type MultimodalDatePickerProps = {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
  date?: Date
  onDateChange?: (date: Date | undefined) => void
  placeholder?: string
  locale?: string
  buttonClassName?: string
  contentClassName?: string
  calendarProps?: Omit<CalendarProps, "mode" | "selected" | "onSelect">
}

// 中文：DatePicker 是 Popover + Calendar 的常用组合，暴露“选择明天/清空日期”等业务友好的目标。
// English: DatePicker composes Popover and Calendar into a target for commands such as choose tomorrow or clear date.
export function MultimodalDatePicker({
  interactionId,
  interactionLabel,
  interactionHint,
  date,
  onDateChange,
  placeholder = "Select date",
  locale,
  buttonClassName,
  contentClassName,
  calendarProps,
}: MultimodalDatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const label = resolveInteractionLabel(interactionLabel, interactionHint, placeholder)

  return (
    <MultimodalGroup
      id={interactionId}
      role="date_picker"
      label={label}
      aliases={resolveInteractionAliases(interactionHint)}
      state={{ open, value: date?.toISOString(), displayValue: formatDate(date, locale) }}
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
            aria-expanded={open}
            className={buttonClassName}
          >
            {formatDate(date, locale) ?? placeholder}
          </ShadcnButton>
        </MultimodalPopoverTrigger>
        <MultimodalPopoverContent
          interactionId={`${interactionId}.calendar`}
          interactionLabel={label}
          className={contentClassName}
        >
          <ShadcnCalendar
            mode="single"
            selected={date}
            onSelect={(nextDate) => {
              onDateChange?.(nextDate)
              setOpen(false)
            }}
            {...calendarProps}
          />
        </MultimodalPopoverContent>
      </Popover>
    </MultimodalGroup>
  )
}

function formatDate(date: Date | undefined, locale = "zh-CN"): string | undefined {
  if (!date) return undefined
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

