import type { InteractionObject } from "@omni-ui/core"
import { getElementLabel, isElementVisible } from "./dom"
import type { RegisteredGroup, RegisteredNode } from "./runtime-types"

export function resolveRegisteredNodeLabel(node: RegisteredNode): string | undefined {
  if (node.label) return node.label
  if (node.hint?.fallbackLabel) return node.hint.fallbackLabel
  if (node.labelFrom === "none") return undefined
  return getElementLabel(node.element)
}

export function buildGroupObjects(
  groups: Map<string, RegisteredGroup>,
  rawObjects: InteractionObject[],
  elementMap: Map<string, HTMLElement>
): InteractionObject[] {
  // 中文：列表容器会给子项推断可见序号，从而支持“第一个/第二项”等自然语言。
  // English: List containers infer visible-order indexes for children, enabling phrases like "first item" or "second item".
  const listGroups = Array.from(groups.values()).filter((group) => group.role === "list")

  return Array.from(groups.values()).filter((group) => isElementVisible(group.element)).map((group) => {
    const children = rawObjects
      .filter((object) => {
        const element = elementMap.get(object.id)
        return element ? group.element.contains(element) : false
      })
      .map((object) => object.id)

    const parentList = listGroups.find(
      (list) => list.id !== group.id && list.element.contains(group.element)
    )
    const siblings = parentList
      ? Array.from(groups.values())
          .filter(
            (candidate) =>
              candidate.role === group.role &&
              candidate.id !== parentList.id &&
              parentList.element.contains(candidate.element)
          )
          .sort(compareElementOrder)
      : []
    const index =
      parentList?.indexBy === "visible_order"
        ? siblings.findIndex((item) => item.id === group.id) + 1
        : undefined
    const inferredState = inferGroupState(group, children, elementMap)
    const primaryControl = inferPrimaryControl(children, elementMap)
    const aliases = [...(group.aliases ?? [])]

    if (index) {
      aliases.push(`第 ${index} 个`, `第${index}个`, `第 ${index} 项`, `第${index}项`)
    }

    return {
      id: group.id,
      type: group.role === "list" ? "container" : "composite",
      role: group.role,
      label: group.label,
      aliases,
      entity: group.entity,
      parent: parentList?.id,
      children,
      primaryControl,
      indexBy: group.indexBy,
      source: "registered_group",
      state: {
        ...(index ? { index } : {}),
        ...inferredState,
        ...(group.state ?? {}),
      },
    }
  })
}

function compareElementOrder(a: RegisteredGroup, b: RegisteredGroup): number {
  if (a.element === b.element) return 0

  const position = a.element.compareDocumentPosition(b.element)
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1
  if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1
  return 0
}

export function isModalGroupActive(
  object: InteractionObject,
  groups: Map<string, RegisteredGroup>
): boolean {
  if (object.state?.open === true || object.state?.active === true) return true
  if (object.state?.open === false || object.state?.active === false) return false

  const group = groups.get(object.id)
  if (!group) return false

  const details = group.element.matches("details")
    ? group.element
    : group.element.querySelector("details")
  if (details instanceof HTMLDetailsElement) return details.open

  const dialog = group.element.matches("dialog")
    ? group.element
    : group.element.querySelector("dialog")
  if (dialog instanceof HTMLDialogElement) return dialog.open

  const roleDialog = group.element.matches("[role='dialog'], [role='alertdialog']")
    ? group.element
    : group.element.querySelector<HTMLElement>("[role='dialog'], [role='alertdialog']")
  if (roleDialog) return isElementVisible(roleDialog)

  return isElementVisible(group.element)
}

function inferGroupState(
  group: RegisteredGroup,
  children: string[],
  elementMap: Map<string, HTMLElement>
): Record<string, unknown> {
  // 中文：Group 状态从子控件推断常见业务线索，例如列表项完成状态和表单字段消息。
  // English: Group state infers common business cues from children, such as item completion and form field messages.
  const state: Record<string, unknown> = {}
  const checkbox = children
    .map((childId) => elementMap.get(childId))
    .find(
      (element): element is HTMLInputElement =>
        element instanceof HTMLInputElement && element.type === "checkbox"
    )

  if (group.role === "list_item" && checkbox) {
    state.completed = checkbox.checked
  }

  if (group.entity) {
    state[`${group.entity.type}Id`] = group.entity.id
  }

  if (group.role === "form_field") {
    const control = children
      .map((childId) => elementMap.get(childId))
      .find((element): element is HTMLElement => Boolean(element && isFormControl(element)))
    const message = children
      .map((childId) => elementMap.get(childId))
      .map((element) => element?.textContent?.replace(/\s+/g, " ").trim())
      .find((text) => text && text !== group.label)

    if (control) state.controlRole = control.dataset.mmRole ?? control.getAttribute("role") ?? control.tagName.toLowerCase()
    if (message) state.message = message
  }

  return state
}

function inferPrimaryControl(
  children: string[],
  elementMap: Map<string, HTMLElement>
): string | undefined {
  return children.find((childId) => {
    const element = elementMap.get(childId)
    return element ? isFormControl(element) || isActionControl(element) : false
  })
}

function isFormControl(element: HTMLElement): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element.getAttribute("role") === "textbox" ||
    element.getAttribute("role") === "radiogroup" ||
    element.getAttribute("role") === "combobox" ||
    element.getAttribute("role") === "slider"
  )
}

function isActionControl(element: HTMLElement): boolean {
  const role = element.dataset.mmRole ?? element.getAttribute("role")
  return (
    element instanceof HTMLButtonElement ||
    [
      "button",
      "switch",
      "checkbox",
      "radio",
      "tab",
      "option",
      "menuitem",
      "menuitemcheckbox",
      "menuitemradio",
      "context_menu_trigger",
      "resize_handle",
      "scroll_area",
      "row",
    ].includes(role ?? "")
  )
}

export function shouldObserveMutation(mutation: MutationRecord): boolean {
  if (isIgnoredRuntimeTarget(mutation.target)) return false

  if (mutation.type !== "childList") return true

  const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes]
  if (!changedNodes.length) return true

  return changedNodes.some((node) => !isIgnoredRuntimeTarget(node))
}

export function isIgnoredRuntimeTarget(target: EventTarget | Node | null): boolean {
  if (!target) return false
  const node = target instanceof Node ? target : undefined
  const element =
    node instanceof Element
      ? node
      : node?.parentElement

  return Boolean(element?.closest("[data-mm-ignore='true']"))
}

export function findObjectIdForDomTarget(
  target: EventTarget | null,
  elementMap: Map<string, HTMLElement>
): string | undefined {
  if (!(target instanceof Node)) return undefined

  return Array.from(elementMap.entries())
    .filter(([, element]) => element === target || element.contains(target))
    .sort(([, a], [, b]) => {
      if (a === b) return 0
      if (a.contains(b)) return 1
      if (b.contains(a)) return -1
      return 0
    })[0]?.[0]
}

export function readInputEventValue(target: EventTarget | null): Record<string, unknown> | undefined {
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return {
      value: target.value,
      inputType: target instanceof HTMLInputElement ? target.type : target.tagName.toLowerCase(),
      required: "required" in target ? Boolean(target.required) : undefined,
      invalid: "validity" in target ? !target.validity.valid : undefined,
    }
  }

  return undefined
}

export function canAcceptRegistration<T extends { ownerId?: string }>(
  existing: T | undefined,
  next: T,
  key: string,
  onError?: (error: Error) => void
): boolean {
  if (!existing) return true
  if (!existing.ownerId || !next.ownerId || existing.ownerId === next.ownerId) return true

  onError?.(
    new Error(
      `Duplicate multimodal registration for ${key}: owner ${next.ownerId} attempted to replace ${existing.ownerId}.`
    )
  )
  return false
}

export function isRegistrationOwner<T extends { ownerId?: string }>(
  current: T | undefined,
  candidate: T
): boolean {
  if (!current) return false
  if (current === candidate) return true
  if (!current.ownerId || !candidate.ownerId) return current === candidate
  return current.ownerId === candidate.ownerId
}

let runtimeOwnerCounter = 0

export function createRuntimeOwnerId(prefix: string): string {
  runtimeOwnerCounter += 1
  return `${prefix}_${runtimeOwnerCounter}`
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "function") return "[function]"
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return Object.keys(item as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = (item as Record<string, unknown>)[key]
          return acc
        }, {})
    }
    return item
  })
}
