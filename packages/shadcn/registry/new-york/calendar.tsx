"use client"

import * as React from "react"
import { Calendar as ShadcnCalendar } from "@/components/ui/calendar"
import { useInteractionNode, type InteractionHint } from "@omni-ui/react"

type MultimodalCalendarProps = React.ComponentProps<typeof ShadcnCalendar> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Calendar 注册为 calendar 区域，日期选择等复杂动作建议由业务 action 执行。
// English: Calendar registers as a calendar region; date picking is best handled by domain actions.
export function MultimodalCalendar({
  interactionId,
  interactionLabel,
  interactionHint,
  ...props
}: MultimodalCalendarProps) {
  const mmRef = useInteractionNode<HTMLDivElement>({
    id: interactionId,
    role: "calendar",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["press"],
    hint: interactionHint,
  })

  return (
    <div ref={mmRef}>
      <ShadcnCalendar {...props} />
    </div>
  )
}
