import type {
  InteractionObject,
  InteractionSnapshot,
  RegisteredActionSpec,
  ValidationResult,
} from "./types"

export function validateCommandScope(
  snapshot: InteractionSnapshot,
  target: InteractionObject,
  spec?: RegisteredActionSpec
): ValidationResult {
  const blockingModal = findBlockingModal(snapshot)
  if (!blockingModal) return { ok: true }
  if (spec?.allowWhenModalOpen) return { ok: true }
  if (isObjectInContext(snapshot, target.id, blockingModal.id)) return { ok: true }

  return {
    ok: false,
    code: "scope_blocked",
    reason: "当前弹窗阻止执行弹窗外的操作",
  }
}

export function findBlockingModal(snapshot: InteractionSnapshot) {
  return [...snapshot.contextStack]
    .reverse()
    .find((context) => context.type === "modal" && context.blocksGlobalActions)
}

export function isObjectInContext(
  snapshot: InteractionSnapshot,
  objectId: string,
  contextId: string
): boolean {
  if (objectId === contextId) return true

  const byId = new Map(snapshot.visibleObjects.map((object) => [object.id, object]))
  let current = byId.get(objectId)

  while (current) {
    if (current.id === contextId || current.parent === contextId) return true
    current = current.parent ? byId.get(current.parent) : undefined
  }

  const root = byId.get(contextId)
  if (!root?.children?.length) return false

  const queue = [...root.children]
  while (queue.length) {
    const nextId = queue.shift()
    if (!nextId) continue
    if (nextId === objectId) return true
    const nextObject = byId.get(nextId)
    if (nextObject?.children?.length) queue.push(...nextObject.children)
  }

  return false
}
