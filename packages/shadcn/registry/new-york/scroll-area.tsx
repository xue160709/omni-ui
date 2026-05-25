"use client"

import * as React from "react"
import {
  ScrollArea as ShadcnScrollArea,
  ScrollBar,
} from "@/components/ui/scroll-area"
import { useInteractionNode, type InteractionHint } from "@omni-ui/react"
import { composeRefs } from "./utils"

type MultimodalScrollAreaProps = React.ComponentProps<typeof ShadcnScrollArea> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：ScrollArea 注册滚动语义，支持“向下看/滚到底部/回到顶部”等命令。
// English: ScrollArea registers scroll semantics for commands such as scroll down, bottom, or top.
export const MultimodalScrollArea = React.forwardRef<
  React.ElementRef<typeof ShadcnScrollArea>,
  MultimodalScrollAreaProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnScrollArea>>({
    id: interactionId,
    role: "scroll_area",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["scrollUp", "scrollDown", "scrollToTop", "scrollToBottom"],
    hint: interactionHint,
  })

  return <ShadcnScrollArea ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalScrollArea.displayName = "MultimodalScrollArea"

export { ScrollBar }

