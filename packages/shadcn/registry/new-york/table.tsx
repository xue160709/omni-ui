"use client"

import * as React from "react"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow as ShadcnTableRow,
} from "@/components/ui/table"
import { useInteractionNode, type InteractionHint } from "@multimodal-ui/react"
import { composeRefs } from "./utils"

type MultimodalTableProps = React.ComponentProps<typeof Table> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Table 根节点提供表格级语义；复杂业务行仍推荐使用 MultimodalDataTable recipe。
// English: Table root provides table-level semantics; use MultimodalDataTable for richer business-row behavior.
export const MultimodalTable = React.forwardRef<
  React.ElementRef<typeof Table>,
  MultimodalTableProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof Table>>({
    id: interactionId,
    role: "table",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["sort", "filter"],
    hint: interactionHint,
  })

  return <Table ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalTable.displayName = "MultimodalTable"

type MultimodalTableRowProps = React.ComponentProps<typeof ShadcnTableRow> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：Table row 注册 selectRow/openRow，支持按可见行文本定位一行。
// English: Table row registers selectRow/openRow so a visible row can be targeted by text.
export const MultimodalTableRow = React.forwardRef<
  React.ElementRef<typeof ShadcnTableRow>,
  MultimodalTableRowProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnTableRow>>({
    id: interactionId,
    role: "row",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["selectRow", "openRow"],
    hint: interactionHint,
  })

  return <ShadcnTableRow ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalTableRow.displayName = "MultimodalTableRow"

export {
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
}

