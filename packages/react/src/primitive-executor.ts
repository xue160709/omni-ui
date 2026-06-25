import type { ActionExecutionResult, PrimitiveAction } from "@omni-ui/core"
import { applyPrimitiveAction, inferPrimitiveActions } from "./dom"

export type PrimitiveExecutionResult = ActionExecutionResult

export function inferDomPrimitiveActions(
  role: string,
  element?: HTMLElement
): PrimitiveAction[] {
  return inferPrimitiveActions(role, element)
}

export function executeDomPrimitiveAction(
  element: HTMLElement,
  action: PrimitiveAction,
  params?: Record<string, unknown>
): PrimitiveExecutionResult {
  return applyPrimitiveAction(element, action, params)
}
