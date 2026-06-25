import type {
  ActionExecutionResult,
  InteractionHint,
  InteractionObject,
  PrimitiveAction,
} from "@omni-ui/core"

let domNodeCounter = 0

export type ExtractedDomNode = {
  object: InteractionObject
  element: HTMLElement
}

const interactiveSelector = [
  "button",
  "input",
  "textarea",
  "select",
  "a[href]",
  "[role]",
  "[aria-label]",
  "[data-mm-role]",
].join(",")

// 中文：从 Provider 根节点内自动抽取可交互 DOM，跳过显式注册过的节点以避免重复对象。
// English: Extracts interactive DOM under the provider root, skipping explicitly registered nodes to avoid duplicate objects.
export function extractDomNodes(root: HTMLElement): ExtractedDomNode[] {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(interactiveSelector))
    .filter((element) => !element.closest("[data-mm-ignore='true']"))
    .filter((element) => !element.dataset.mmNodeId)
    .filter((element) => isElementVisible(element))

  return elements.map((element) => {
    const role = inferRole(element)
    const id = ensureDomId(element, role)
    const label = getElementLabel(element)
    const state = getElementState(element)

    return {
      element,
      object: {
        id,
        type: "raw",
        role,
        label,
        aliases: getAliases(element),
        state,
        primitiveActions: inferPrimitiveActions(role, element),
        source: "dom",
      },
    }
  })
}

// 中文：标签来源按显式 data/ARIA、labelledby、表单 label、placeholder、文本内容依次兜底。
// English: Label lookup falls back through explicit data/ARIA, labelledby, form label, placeholder, and visible text.
export function getElementLabel(element: HTMLElement): string | undefined {
  const explicit = element.dataset.mmLabel ?? element.getAttribute("aria-label")
  if (explicit?.trim()) return explicit.trim()

  const labelledBy = element.getAttribute("aria-labelledby")
  if (labelledBy) {
    const label = labelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent?.trim())
      .filter(Boolean)
      .join(" ")
    if (label) return label
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const label = findAssociatedLabel(element)
    if (label) return label
    if (element.placeholder) return element.placeholder
  }

  const text = element.textContent?.replace(/\s+/g, " ").trim()
  return text || undefined
}

// 中文：primitiveActions 表示无需业务 executor 也能安全尝试的基础 DOM 操作。
// English: primitiveActions are basic DOM operations that can be attempted without a domain executor.
export function inferPrimitiveActions(role: string, element?: HTMLElement): PrimitiveAction[] {
  if (role === "button" || role === "link") return ["press"]
  if (role === "switch") return ["turnOn", "turnOff", "toggle"]
  if (role === "checkbox") return ["check", "uncheck", "toggle"]
  if (role === "radio") return ["select"]
  if (role === "radiogroup" || role === "toggle_group") return ["selectByLabel", "selectByIndex"]
  if (role === "slider") return ["setValue", "increase", "decrease"]
  if (role === "textbox") return ["focus", "setText", "appendText", "clear"]
  if (role === "tab") return ["switchTo", "select"]
  if (role === "select" || role === "combobox") return ["open", "selectByLabel", "selectByIndex"]
  if (role === "context_menu_trigger") return ["open"]
  if (role === "menuitemcheckbox") return ["toggle", "select", "press"]
  if (role === "menuitemradio") return ["select", "press"]
  if (role === "option" || role === "menuitem") return ["select", "press"]
  if (element instanceof HTMLSelectElement) return ["selectByLabel", "selectByIndex"]
  return []
}

// 中文：把 DOM/ARIA 的当前状态转换成 snapshot 可序列化状态，供规则和模型判断可用性。
// English: Converts current DOM/ARIA state into JSON-friendly snapshot state for rules and models.
export function getElementState(element: HTMLElement): Record<string, unknown> {
  const state: Record<string, unknown> = {
    enabled: !isDisabled(element),
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    state.hasValue = element.value.length > 0
    state.length = element.value.length
    state.inputType = element instanceof HTMLInputElement ? element.type : "textarea"
    state.required = element.required
    state.invalid = !element.validity.valid
    if (element.dataset.mmExposure === "value" && !isSensitiveElement(element)) {
      state.value = element.value
    }
  }

  if (element instanceof HTMLInputElement && element.type === "checkbox") {
    state.checked = element.checked
  }

  if (element.getAttribute("aria-checked") != null) {
    state.checked = element.getAttribute("aria-checked") === "true"
  }

  if (element.getAttribute("aria-selected") != null) {
    state.selected = element.getAttribute("aria-selected") === "true"
  }

  if (element.getAttribute("aria-pressed") != null) {
    state.pressed = element.getAttribute("aria-pressed") === "true"
  }

  if (element.getAttribute("aria-expanded") != null) {
    state.expanded = element.getAttribute("aria-expanded") === "true"
  }

  if (element.getAttribute("aria-valuenow") != null) {
    state.value = Number(element.getAttribute("aria-valuenow"))
  }

  if (element.getAttribute("aria-valuemin") != null) {
    state.min = Number(element.getAttribute("aria-valuemin"))
  }

  if (element.getAttribute("aria-valuemax") != null) {
    state.max = Number(element.getAttribute("aria-valuemax"))
  }

  if (element instanceof HTMLSelectElement) {
    state.value = element.value
    state.options = Array.from(element.options).map((option) => ({
      label: option.label,
      value: option.value,
      selected: option.selected,
    }))
  }

  return state
}

// 中文：优先尊重 data-mm-role 和 ARIA role，再按原生元素推断语义角色。
// English: Respects data-mm-role and ARIA role first, then infers semantics from native elements.
export function inferRole(element: HTMLElement): string {
  const role = element.dataset.mmRole ?? element.getAttribute("role")
  if (role) return role

  if (element instanceof HTMLButtonElement) return "button"
  if (element instanceof HTMLAnchorElement) return "link"
  if (element instanceof HTMLTextAreaElement) return "textbox"
  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox") return "checkbox"
    if (element.type === "radio") return "radio"
    if (element.type === "range") return "slider"
    return "textbox"
  }
  if (element instanceof HTMLSelectElement) return "select"

  return "generic"
}

// 中文：执行 primitive 时尽量触发真实 DOM 事件，让 React/shadcn 的状态更新路径保持一致。
// English: Primitive execution dispatches real DOM events where possible so React/shadcn state updates stay on their normal path.
export function applyPrimitiveAction(
  element: HTMLElement,
  action: PrimitiveAction,
  params?: Record<string, unknown>
): ActionExecutionResult {
  if (isDisabled(element) || element.hasAttribute("inert") || element.closest("[inert]")) {
    return { status: "rejected", reason: "Primitive target is disabled or inert.", code: "target_disabled" }
  }
  if (!isElementVisible(element)) {
    return { status: "rejected", reason: "Primitive target is hidden.", code: "target_hidden" }
  }

  if (action === "focus") {
    const before = element.ownerDocument.activeElement
    element.focus()
    return before === element ? { status: "noop", reason: "Element already focused." } : { status: "changed" }
  }

  if (action === "setText" && "value" in element) {
    const target = element as HTMLInputElement | HTMLTextAreaElement
    const nextValue = String(params?.value ?? "")
    if (target.value === nextValue) return { status: "noop", reason: "Text already has the requested value." }
    setNativeValue(target, nextValue)
    element.dispatchEvent(new Event("input", { bubbles: true }))
    element.dispatchEvent(new Event("change", { bubbles: true }))
    return target.value === nextValue
      ? { status: "changed", data: { length: nextValue.length } }
      : { status: "rejected", reason: "Text value did not update.", code: "value_not_applied" }
  }

  if (action === "appendText" && "value" in element) {
    const target = element as HTMLInputElement | HTMLTextAreaElement
    const append = String(params?.value ?? params?.text ?? "")
    if (!append) return { status: "noop", reason: "No text was provided." }
    setNativeValue(target, `${target.value}${append}`)
    element.dispatchEvent(new Event("input", { bubbles: true }))
    element.dispatchEvent(new Event("change", { bubbles: true }))
    return { status: "changed", data: { length: target.value.length } }
  }

  if (action === "clear" && "value" in element) {
    const target = element as HTMLInputElement | HTMLTextAreaElement
    if (!target.value) return { status: "noop", reason: "Text is already empty." }
    setNativeValue(target, "")
    element.dispatchEvent(new Event("input", { bubbles: true }))
    element.dispatchEvent(new Event("change", { bubbles: true }))
    return target.value === ""
      ? { status: "changed" }
      : { status: "rejected", reason: "Text value did not clear.", code: "value_not_applied" }
  }

  if (element instanceof HTMLSelectElement && action === "selectByLabel") {
    const label = String(params?.label ?? params?.value ?? "")
    const option = Array.from(element.options).find(
      (item) => item.label === label || item.textContent?.trim() === label || item.value === label
    )
    if (option) {
      if (element.value === option.value) return { status: "noop", reason: "Option is already selected." }
      element.value = option.value
      element.dispatchEvent(new Event("change", { bubbles: true }))
      return { status: "changed", data: { value: option.value } }
    }
    return { status: "rejected", reason: `No option matches "${label}".`, code: "option_not_found" }
  }

  if (element instanceof HTMLSelectElement && action === "selectByIndex") {
    const index = Number(params?.index ?? 1) - 1
    const option = element.options.item(index)
    if (option) {
      if (element.value === option.value) return { status: "noop", reason: "Option is already selected." }
      element.value = option.value
      element.dispatchEvent(new Event("change", { bubbles: true }))
      return { status: "changed", data: { value: option.value } }
    }
    return { status: "rejected", reason: `No option exists at index ${index + 1}.`, code: "option_not_found" }
  }

  if (action === "setValue" && isSliderLike(element)) {
    return setSliderValue(element, Number(params?.value))
  }

  if (action === "increase" && isSliderLike(element)) {
    return stepSliderValue(element, 1)
  }

  if (action === "decrease" && isSliderLike(element)) {
    return stepSliderValue(element, -1)
  }

  if (action === "check" && element instanceof HTMLInputElement && !element.checked) {
    element.click()
    return { status: "changed" }
  }

  if (action === "check" && element instanceof HTMLInputElement && element.checked) {
    return { status: "noop", reason: "Checkbox is already checked." }
  }

  if (action === "uncheck" && element instanceof HTMLInputElement && element.checked) {
    element.click()
    return { status: "changed" }
  }

  if (action === "uncheck" && element instanceof HTMLInputElement && !element.checked) {
    return { status: "noop", reason: "Checkbox is already unchecked." }
  }

  if (action === "turnOn" && getElementState(element).checked === false) {
    element.click()
    return { status: "changed" }
  }

  if (action === "turnOn" && getElementState(element).checked === true) {
    return { status: "noop", reason: "Switch is already on." }
  }

  if (action === "turnOff" && getElementState(element).checked === true) {
    element.click()
    return { status: "changed" }
  }

  if (action === "turnOff" && getElementState(element).checked === false) {
    return { status: "noop", reason: "Switch is already off." }
  }

  if (
    [
      "press",
      "toggle",
      "open",
      "close",
      "confirm",
      "cancel",
      "select",
      "switchTo",
      "selectRow",
      "openRow",
      "next",
      "previous",
    ].includes(action)
  ) {
    element.click()
    return { status: "changed" }
  }

  return { status: "unsupported", reason: `Primitive action "${action}" is not supported by the DOM executor.` }
}

function findScrollTarget(element: HTMLElement): HTMLElement {
  const radixViewport = element.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]")
  if (radixViewport) return radixViewport

  if (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth) {
    return element
  }

  return (
    Array.from(element.querySelectorAll<HTMLElement>("*")).find(
      (candidate) =>
        candidate.scrollHeight > candidate.clientHeight ||
        candidate.scrollWidth > candidate.clientWidth
    ) ?? element
  )
}

// 中文：可见性判断覆盖 hidden/aria-hidden、关闭的 details、display/visibility，避免快照暴露不可操作目标。
// English: Visibility checks cover hidden/aria-hidden, closed details, and display/visibility so snapshots omit unusable targets.
export function isElementVisible(element: HTMLElement): boolean {
  if (element.hidden || element.getAttribute("aria-hidden") === "true") return false
  if (element.closest("[hidden], [aria-hidden='true']")) return false

  const closedDetails = element.closest("details:not([open])")
  if (closedDetails) {
    const visibleSummary = element.closest("summary")
    if (!visibleSummary || visibleSummary.parentElement !== closedDetails) return false
  }

  const view = element.ownerDocument.defaultView
  const style = view?.getComputedStyle(element)
  if (style?.display === "none" || style?.visibility === "hidden") return false

  return true
}

export function hintToAliases(hint?: InteractionHint): string[] | undefined {
  return hint?.aliases?.length ? hint.aliases : undefined
}

function ensureDomId(element: HTMLElement, role: string): string {
  if (!element.dataset.mmDomId) {
    element.dataset.mmDomId = `dom.${role}.${++domNodeCounter}`
  }
  return element.dataset.mmDomId
}

function getAliases(element: HTMLElement): string[] | undefined {
  const aliases = element.dataset.mmAliases
  return aliases ? aliases.split("|").filter(Boolean) : undefined
}

function isDisabled(element: HTMLElement): boolean {
  return Boolean(
    element.getAttribute("aria-disabled") === "true" ||
      (element as HTMLButtonElement | HTMLInputElement).disabled
  )
}

function isSensitiveElement(element: HTMLElement): boolean {
  const autocomplete = element.getAttribute("autocomplete") ?? ""
  const name = `${element.getAttribute("name") ?? ""} ${element.id ?? ""}`
  return Boolean(
    element.dataset.mmSensitive != null ||
      element instanceof HTMLInputElement &&
        ["password", "hidden", "file"].includes(element.type) ||
      /one-time-code|current-password|new-password|cc-/i.test(autocomplete) ||
      /password|passcode|otp|token|api[_-]?key|secret|card|cvv/i.test(name)
  )
}

function setNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string
): void {
  const prototype = Object.getPrototypeOf(element) as HTMLInputElement | HTMLTextAreaElement
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value")
  if (descriptor?.set) {
    descriptor.set.call(element, value)
    return
  }
  element.value = value
}

function isSliderLike(element: HTMLElement): boolean {
  return (
    element instanceof HTMLInputElement && element.type === "range" ||
    element.getAttribute("role") === "slider"
  )
}

function setSliderValue(element: HTMLElement, value: number): ActionExecutionResult {
  if (!Number.isFinite(value)) return { status: "rejected", reason: "Slider value must be a finite number.", code: "invalid_value" }
  const { min, max } = getSliderRange(element)
  const clamped = Math.max(min, Math.min(max, value))
  const before = getSliderValue(element)
  if (before === clamped) return { status: "noop", reason: "Slider is already at the requested value." }
  writeSliderValue(element, clamped)
  return getSliderValue(element) === clamped
    ? { status: "changed", data: { value: clamped } }
    : { status: "rejected", reason: "Slider value did not update.", code: "value_not_applied" }
}

function stepSliderValue(element: HTMLElement, direction: 1 | -1): ActionExecutionResult {
  const { min, max, step } = getSliderRange(element)
  const before = getSliderValue(element)
  const next = Math.max(min, Math.min(max, before + direction * step))
  if (next === before) return { status: "noop", reason: "Slider is already at its boundary." }
  writeSliderValue(element, next)
  return { status: "changed", data: { value: next } }
}

function getSliderRange(element: HTMLElement): { min: number; max: number; step: number } {
  const min = Number(
    element instanceof HTMLInputElement ? element.min || 0 : element.getAttribute("aria-valuemin") ?? 0
  )
  const max = Number(
    element instanceof HTMLInputElement ? element.max || 100 : element.getAttribute("aria-valuemax") ?? 100
  )
  const step = Number(
    element instanceof HTMLInputElement ? element.step || 1 : element.getAttribute("data-mm-step") ?? 1
  )
  return {
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 100,
    step: Number.isFinite(step) && step > 0 ? step : 1,
  }
}

function getSliderValue(element: HTMLElement): number {
  const value = Number(
    element instanceof HTMLInputElement ? element.value : element.getAttribute("aria-valuenow")
  )
  return Number.isFinite(value) ? value : 0
}

function writeSliderValue(element: HTMLElement, value: number): void {
  if (element instanceof HTMLInputElement) {
    setNativeValue(element, String(value))
    element.dispatchEvent(new Event("input", { bubbles: true }))
    element.dispatchEvent(new Event("change", { bubbles: true }))
    return
  }

  element.setAttribute("aria-valuenow", String(value))
  element.dispatchEvent(new Event("input", { bubbles: true }))
  element.dispatchEvent(new Event("change", { bubbles: true }))
}

function findAssociatedLabel(element: HTMLInputElement | HTMLTextAreaElement): string | undefined {
  if (element.id) {
    const label = element.ownerDocument.querySelector<HTMLLabelElement>(`label[for="${element.id}"]`)
    if (label?.textContent?.trim()) return label.textContent.trim()
  }

  const wrappingLabel = element.closest("label")
  return wrappingLabel?.textContent?.replace(/\s+/g, " ").trim() || undefined
}
