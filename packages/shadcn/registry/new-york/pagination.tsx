"use client"

import * as React from "react"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink as ShadcnPaginationLink,
  PaginationNext as ShadcnPaginationNext,
  PaginationPrevious as ShadcnPaginationPrevious,
} from "@/components/ui/pagination"
import { useInteractionNode, type InteractionHint } from "@multimodal-ui/react"
import { composeRefs } from "./utils"

type MultimodalPaginationLinkProps = React.ComponentProps<typeof ShadcnPaginationLink> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Pagination link 注册为 link，支持“去第 3 页”等分页导航。
// English: Pagination link registers as a link for page navigation commands.
export const MultimodalPaginationLink = React.forwardRef<
  React.ElementRef<typeof ShadcnPaginationLink>,
  MultimodalPaginationLinkProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnPaginationLink>>({
    id: interactionId,
    role: "link",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["press"],
    hint: interactionHint,
  })

  return <ShadcnPaginationLink ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalPaginationLink.displayName = "MultimodalPaginationLink"

type MultimodalPaginationPreviousProps = React.ComponentProps<typeof ShadcnPaginationPrevious> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalPaginationPrevious = React.forwardRef<
  React.ElementRef<typeof ShadcnPaginationPrevious>,
  MultimodalPaginationPreviousProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnPaginationPrevious>>({
    id: interactionId,
    role: "link",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["press"],
    hint: interactionHint,
  })

  return <ShadcnPaginationPrevious ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalPaginationPrevious.displayName = "MultimodalPaginationPrevious"

type MultimodalPaginationNextProps = React.ComponentProps<typeof ShadcnPaginationNext> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalPaginationNext = React.forwardRef<
  React.ElementRef<typeof ShadcnPaginationNext>,
  MultimodalPaginationNextProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnPaginationNext>>({
    id: interactionId,
    role: "link",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["press"],
    hint: interactionHint,
  })

  return <ShadcnPaginationNext ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalPaginationNext.displayName = "MultimodalPaginationNext"

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
}

