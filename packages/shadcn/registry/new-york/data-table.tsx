"use client"

import * as React from "react"
import { MultimodalGroup, type EntityRef, type InteractionHint } from "@omni-ui/react"
import { MultimodalButton } from "./button"
import { resolveInteractionAliases, resolveInteractionLabel } from "./utils"

export type MultimodalDataTableColumn<TRow> = {
  id: string
  header: React.ReactNode
  cell: (row: TRow) => React.ReactNode
  className?: string
}

export type MultimodalDataTableAction<TRow> = {
  id: string
  label: string
  onSelect: (row: TRow) => void
}

type MultimodalDataTableProps<TRow> = React.HTMLAttributes<HTMLDivElement> & {
  interactionId: string
  interactionLabel?: string
  interactionHint?: InteractionHint
  label?: string
  rows: TRow[]
  columns: Array<MultimodalDataTableColumn<TRow>>
  actions?: Array<MultimodalDataTableAction<TRow>>
  emptyLabel?: string
  getRowId: (row: TRow) => string
  getRowLabel: (row: TRow) => string
  getRowEntity?: (row: TRow) => EntityRef | undefined
  getRowState?: (row: TRow, index: number) => Record<string, unknown>
}

export function MultimodalDataTable<TRow>({
  interactionId,
  interactionLabel,
  interactionHint,
  label,
  rows,
  columns,
  actions = [],
  emptyLabel = "No rows.",
  getRowId,
  getRowLabel,
  getRowEntity,
  getRowState,
  children,
  ...props
}: MultimodalDataTableProps<TRow>) {
  return (
    <MultimodalGroup
      id={interactionId}
      role="list"
      label={resolveInteractionLabel(interactionLabel, interactionHint, label)}
      aliases={resolveInteractionAliases(interactionHint)}
      indexBy="visible_order"
    >
      <div role="table" {...props}>
        <div role="rowgroup" className="border-b text-sm font-medium text-muted-foreground">
          <div role="row" className="grid gap-3 py-2" style={{ gridTemplateColumns: gridTemplate(columns, actions) }}>
            {columns.map((column) => (
              <div key={column.id} role="columnheader" className={column.className}>
                {column.header}
              </div>
            ))}
            {actions.length ? <div role="columnheader">Actions</div> : null}
          </div>
        </div>

        <div role="rowgroup" className="divide-y">
          {rows.length === 0 ? (
            <div className="py-6 text-sm text-muted-foreground">{emptyLabel}</div>
          ) : (
            rows.map((row, index) => {
              const rowId = getRowId(row)
              const rowLabel = getRowLabel(row)
              const state = {
                ...(getRowState?.(row, index) ?? {}),
                rowId,
              }

              return (
                <MultimodalGroup
                  key={rowId}
                  id={`${interactionId}.row.${rowId}`}
                  role="list_item"
                  label={rowLabel}
                  entity={getRowEntity?.(row)}
                  state={state}
                >
                  <div
                    role="row"
                    className="grid items-center gap-3 py-3 text-sm"
                    style={{ gridTemplateColumns: gridTemplate(columns, actions) }}
                  >
                    {columns.map((column) => (
                      <div key={column.id} role="cell" className={column.className}>
                        {column.cell(row)}
                      </div>
                    ))}
                    {actions.length ? (
                      <div role="cell" className="flex flex-wrap gap-2">
                        {actions.map((action) => (
                          <MultimodalButton
                            key={action.id}
                            interactionId={`${interactionId}.row.${rowId}.${action.id}`}
                            interactionLabel={`${action.label} ${rowLabel}`}
                            size="sm"
                            type="button"
                            onClick={() => action.onSelect(row)}
                          >
                            {action.label}
                          </MultimodalButton>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </MultimodalGroup>
              )
            })
          )}
        </div>
        {children}
      </div>
    </MultimodalGroup>
  )
}

function gridTemplate<TRow>(
  columns: Array<MultimodalDataTableColumn<TRow>>,
  actions: Array<MultimodalDataTableAction<TRow>>
): string {
  return [...columns.map(() => "minmax(0, 1fr)"), ...(actions.length ? ["auto"] : [])].join(" ")
}
