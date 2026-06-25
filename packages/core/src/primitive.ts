import type { LegacyPrimitiveAction, PrimitiveAction, PrimitiveActionId } from "./types"

const builtinPrimitiveActions = new Set<PrimitiveActionId>([
  "press",
  "toggle",
  "check",
  "uncheck",
  "focus",
  "setText",
  "appendText",
  "clear",
  "setValue",
  "increase",
  "decrease",
  "open",
  "close",
  "selectByLabel",
  "selectByIndex",
])

const legacyPrimitiveAliases: Record<LegacyPrimitiveAction, PrimitiveActionId> = {
  turnOn: "check",
  turnOff: "uncheck",
  confirm: "press",
  cancel: "press",
  select: "press",
  switchTo: "press",
  search: "focus",
  selectResult: "press",
  scrollUp: "ext:scrollUp",
  scrollDown: "ext:scrollDown",
  scrollToTop: "ext:scrollToTop",
  scrollToBottom: "ext:scrollToBottom",
  selectDate: "press",
  nextMonth: "press",
  previousMonth: "press",
  next: "press",
  previous: "press",
  selectSlide: "press",
  resize: "ext:resize",
}

// 中文：Runtime 内部只传播 builtin 或 ext:* primitive；旧封装传入的别名在入口处兼容归一化。
// English: Runtime internals only carry builtin or ext:* primitives; legacy aliases are normalized at entry points.
export function normalizePrimitiveAction(action: PrimitiveAction | string): PrimitiveActionId {
  if (builtinPrimitiveActions.has(action as PrimitiveActionId)) {
    return action as PrimitiveActionId
  }

  if (action.startsWith("ext:")) {
    return action as PrimitiveActionId
  }

  const legacy = legacyPrimitiveAliases[action as LegacyPrimitiveAction]
  if (legacy) return legacy

  return `ext:${action}` as PrimitiveActionId
}

export function normalizePrimitiveActions(
  actions: ReadonlyArray<PrimitiveAction | string> | undefined
): PrimitiveActionId[] | undefined {
  if (!actions?.length) return undefined
  return [...new Set(actions.map((action) => normalizePrimitiveAction(action)))]
}

export function isBuiltinPrimitiveAction(action: string): action is PrimitiveActionId {
  return builtinPrimitiveActions.has(action as PrimitiveActionId)
}
