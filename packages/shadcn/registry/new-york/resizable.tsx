"use client"

import * as React from "react"
import {
  ResizableHandle as ShadcnResizableHandle,
  ResizablePanel as ShadcnResizablePanel,
  ResizablePanelGroup as ShadcnResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  MultimodalGroup,
  useInteractionNode,
  type InteractionHint,
} from "@omni-ui/react"
import { composeRefs, resolveInteractionAliases, resolveInteractionLabel } from "./utils"

type MultimodalResizablePanelGroupProps = React.ComponentProps<typeof ShadcnResizablePanelGroup> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：ResizablePanelGroup 注册为 resizable_panel_group，表达可调整布局的整体区域。
// English: ResizablePanelGroup registers as resizable_panel_group for adjustable layout regions.
export function MultimodalResizablePanelGroup({
  interactionId,
  interactionLabel,
  interactionHint,
  children,
  ...props
}: MultimodalResizablePanelGroupProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="resizable_panel_group"
      label={resolveInteractionLabel(interactionLabel, interactionHint, "可调整布局")}
      aliases={resolveInteractionAliases(interactionHint)}
      state={{ direction: props.direction }}
    >
      <ShadcnResizablePanelGroup {...props}>{children}</ShadcnResizablePanelGroup>
    </MultimodalGroup>
  )
}

type MultimodalResizablePanelProps = React.ComponentProps<typeof ShadcnResizablePanel> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Panel 注册为 resizable_panel，供“放大左侧面板/收起详情”这类命令定位。
// English: Panel registers as resizable_panel for commands such as enlarge the left panel or collapse details.
export function MultimodalResizablePanel({
  interactionId,
  interactionLabel,
  interactionHint,
  children,
  ...props
}: MultimodalResizablePanelProps) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="resizable_panel"
      label={resolveInteractionLabel(interactionLabel, interactionHint)}
      aliases={resolveInteractionAliases(interactionHint)}
    >
      <ShadcnResizablePanel {...props}>{children}</ShadcnResizablePanel>
    </MultimodalGroup>
  )
}

type MultimodalResizableHandleProps = React.ComponentProps<typeof ShadcnResizableHandle> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Handle 注册 ext:resize/increase/decrease，为后续可访问式调节和业务执行留目标。
// English: Handle registers ext:resize/increase/decrease as a target for accessible resizing or domain execution.
export const MultimodalResizableHandle = React.forwardRef<
  React.ElementRef<typeof ShadcnResizableHandle>,
  MultimodalResizableHandleProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnResizableHandle>>({
    id: interactionId,
    role: "resize_handle",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["ext:resize", "increase", "decrease"],
    hint: interactionHint,
  })

  return <ShadcnResizableHandle ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalResizableHandle.displayName = "MultimodalResizableHandle"
