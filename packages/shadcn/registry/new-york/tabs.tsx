"use client"

import * as React from "react"
import {
  Tabs,
  TabsContent,
  TabsList as ShadcnTabsList,
  TabsTrigger as ShadcnTabsTrigger,
} from "@/components/ui/tabs"
import { MultimodalGroup, useInteractionNode, type InteractionHint } from "@omni-ui/react"
import { composeRefs, resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalTabsListProps = React.ComponentProps<typeof ShadcnTabsList> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：TabsList 作为 filter_tabs 容器，让一组选项卡在 snapshot 中形成同一语义分组。
// English: TabsList registers as a filter_tabs container so related tabs appear as one semantic group in snapshots.
export function MultimodalTabsList({
  interactionId,
  interactionLabel,
  interactionHint,
  children,
  ...props
}: MultimodalTabsListProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="filter_tabs"
      label={resolveInteractionLabel(interactionLabel, interactionHint, "选项卡")}
      aliases={resolveInteractionAliases(interactionHint)}
    >
      <ShadcnTabsList {...props}>{children}</ShadcnTabsList>
    </MultimodalGroup>
  )
}

type MultimodalTabsTriggerProps = React.ComponentProps<typeof ShadcnTabsTrigger> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：TabsTrigger 注册 press，适合“切到已完成/只看待处理”等筛选命令。
// English: TabsTrigger registers press for filter commands such as switching to completed or pending.
export const MultimodalTabsTrigger = React.forwardRef<
  React.ElementRef<typeof ShadcnTabsTrigger>,
  MultimodalTabsTriggerProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnTabsTrigger>>({
    id: interactionId,
    role: "tab",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["press"],
    hint: interactionHint,
  })

  return <ShadcnTabsTrigger ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalTabsTrigger.displayName = "MultimodalTabsTrigger"

export { Tabs, TabsContent }
