import type { InteractionHint, InteractionObject, PrimitiveAction } from "@multimodal-ui/core"

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

export function extractDomNodes(root: HTMLElement): ExtractedDomNode[] {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(interactiveSelector))
    .filter((element) => !element.closest("[data-mm-ignore='true']"))
    .filter((element) => !element.dataset.mmNodeId)

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

export function inferPrimitiveActions(role: string, element?: HTMLElement): PrimitiveAction[] {
  if (role === "button" || role === "link") return ["press"]
  if (role === "switch") return ["turnOn", "turnOff", "toggle"]
  if (role === "checkbox") return ["check", "uncheck", "toggle"]
  if (role === "radio") return ["select"]
  if (role === "slider") return ["setValue", "increase", "decrease"]
  if (role === "textbox") return ["focus", "setText", "appendText", "clear"]
  if (role === "tab") return ["switchTo", "select"]
  if (role === "option" || role === "menuitem") return ["select", "press"]
  if (element instanceof HTMLSelectElement) return ["selectByLabel", "selectByIndex"]
  return []
}

export function getElementState(element: HTMLElement): Record<string, unknown> {
  const state: Record<string, unknown> = {
    enabled: !isDisabled(element),
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    state.value = element.value
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

  if (element.getAttribute("aria-valuenow") != null) {
    state.value = Number(element.getAttribute("aria-valuenow"))
  }

  if (element.getAttribute("aria-valuemin") != null) {
    state.min = Number(element.getAttribute("aria-valuemin"))
  }

  if (element.getAttribute("aria-valuemax") != null) {
    state.max = Number(element.getAttribute("aria-valuemax"))
  }

  return state
}

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

export function applyPrimitiveAction(
  element: HTMLElement,
  action: PrimitiveAction,
  params?: Record<string, unknown>
): void {
  if (action === "focus") {
    element.focus()
    return
  }

  if (action === "setText" && "value" in element) {
    ;(element as HTMLInputElement | HTMLTextAreaElement).value = String(params?.value ?? "")
    element.dispatchEvent(new Event("input", { bubbles: true }))
    return
  }

  if (action === "clear" && "value" in element) {
    ;(element as HTMLInputElement | HTMLTextAreaElement).value = ""
    element.dispatchEvent(new Event("input", { bubbles: true }))
    return
  }

  if (action === "check" && element instanceof HTMLInputElement && !element.checked) {
    element.click()
    return
  }

  if (action === "uncheck" && element instanceof HTMLInputElement && element.checked) {
    element.click()
    return
  }

  if (action === "turnOn" && getElementState(element).checked === false) {
    element.click()
    return
  }

  if (action === "turnOff" && getElementState(element).checked === true) {
    element.click()
    return
  }

  if (["press", "toggle", "open", "close", "confirm", "cancel", "select", "switchTo"].includes(action)) {
    element.click()
  }
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

function findAssociatedLabel(element: HTMLInputElement | HTMLTextAreaElement): string | undefined {
  if (element.id) {
    const label = element.ownerDocument.querySelector<HTMLLabelElement>(`label[for="${element.id}"]`)
    if (label?.textContent?.trim()) return label.textContent.trim()
  }

  const wrappingLabel = element.closest("label")
  return wrappingLabel?.textContent?.replace(/\s+/g, " ").trim() || undefined
}
