"use client"

import * as React from "react"
import {
  Tabs,
  TabsContent,
  TabsList as ShadcnTabsList,
  TabsTrigger as ShadcnTabsTrigger,
} from "@/components/ui/tabs"
import { MultimodalGroup, useInteractionNode, type InteractionHint } from "@multimodal-ui/react"

type MultimodalTabsListProps = React.ComponentProps<typeof ShadcnTabsList> & {
  interactionId: string
  interactionLabel?: string
}

export function MultimodalTabsList({
  interactionId,
  interactionLabel = "选项卡",
  children,
  ...props
}: MultimodalTabsListProps) {
  return (
    <MultimodalGroup id={interactionId} role="filter_tabs" label={interactionLabel}>
      <ShadcnTabsList {...props}>{children}</ShadcnTabsList>
    </MultimodalGroup>
  )
}

type MultimodalTabsTriggerProps = React.ComponentProps<typeof ShadcnTabsTrigger> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalTabsTrigger = React.forwardRef<
  React.ElementRef<typeof ShadcnTabsTrigger>,
  MultimodalTabsTriggerProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnTabsTrigger>>({
    id: interactionId,
    role: "tab",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["switchTo", "select"],
    hint: interactionHint,
  })

  return <ShadcnTabsTrigger ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalTabsTrigger.displayName = "MultimodalTabsTrigger"

export { Tabs, TabsContent }

function composeRefs<T>(...refs: Array<React.Ref<T> | undefined>): React.RefCallback<T> {
  return (node) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    })
  }
}
