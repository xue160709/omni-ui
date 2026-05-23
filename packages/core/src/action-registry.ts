import type {
  ActionContext,
  ActionPayload,
  DispatchContext,
  InteractionObject,
  InteractionSnapshot,
  RegisteredActionSpec,
  ValidationResult,
} from "./types"

export function actionMatchesObject(
  spec: RegisteredActionSpec,
  object: InteractionObject
): boolean {
  const attachTo = spec.attachTo

  if (attachTo?.id) return object.id === attachTo.id
  if (attachTo?.entityType) return object.entity?.type === attachTo.entityType
  if (attachTo?.role) return object.role === attachTo.role

  if (spec.executeScope === "page") return object.type === "page"
  if (spec.executeScope === "container") return object.type === "container"

  return false
}

export function getAvailableActionsForObject(
  object: InteractionObject,
  actionSpecs: Record<string, RegisteredActionSpec>,
  snapshot: InteractionSnapshot,
  candidate?: ActionContext["candidate"]
): string[] {
  return Object.values(actionSpecs)
    .filter((spec) => actionMatchesObject(spec, object))
    .filter((spec) => {
      if (!spec.availableWhen) return true
      return spec.availableWhen({
        actionId: spec.id,
        target: object,
        snapshot,
        candidate,
        utterance: candidate?.utterance,
      })
    })
    .map((spec) => spec.id)
}

export function attachDomainActions(
  objects: InteractionObject[],
  actionSpecs: Record<string, RegisteredActionSpec>,
  snapshotBase: Omit<InteractionSnapshot, "visibleObjects">
): InteractionObject[] {
  const provisionalSnapshot: InteractionSnapshot = {
    ...snapshotBase,
    visibleObjects: objects,
  }

  return objects.map((object) => {
    const actions = getAvailableActionsForObject(object, actionSpecs, provisionalSnapshot)
    if (actions.length === 0) return object
    return {
      ...object,
      actions: Array.from(new Set([...(object.actions ?? []), ...actions])),
    }
  })
}

export function validateActionRequest(
  snapshot: InteractionSnapshot,
  context: DispatchContext
): ValidationResult {
  if (context.baseStateVersion !== snapshot.stateVersion) {
    return {
      ok: false,
      code: "state_changed",
      reason: "界面状态已变化，请重新确认操作目标",
    }
  }

  const spec = snapshot.actionSpecs[context.actionId]
  if (!spec) {
    return {
      ok: false,
      code: "missing_action",
      reason: "当前页面没有注册该操作",
    }
  }

  if (spec.requiresConfirmation && context.confirmedActionId !== context.actionId) {
    return {
      ok: false,
      code: "confirmation_required",
      reason: "该操作需要确认",
    }
  }

  const target = snapshot.visibleObjects.find((object) => object.id === context.targetId)
  if (!target) {
    return {
      ok: false,
      code: "target_missing",
      reason: "没有找到对应的操作目标",
    }
  }

  if (spec.availableWhen) {
    const available = spec.availableWhen({
      actionId: spec.id,
      target,
      snapshot,
      candidate: context.candidate,
      utterance: context.utterance,
    })

    if (!available) {
      return {
        ok: false,
        code: "unavailable",
        reason: "当前目标不支持该操作",
      }
    }
  }

  return { ok: true }
}

export function buildActionPayload(
  snapshot: InteractionSnapshot,
  context: DispatchContext
): ActionPayload {
  const spec = snapshot.actionSpecs[context.actionId]
  const target = snapshot.visibleObjects.find((object) => object.id === context.targetId)

  if (!spec || !target) {
    return { type: context.actionId, ...(context.candidate?.params ?? {}) }
  }

  const actionContext: ActionContext = {
    actionId: context.actionId,
    target,
    snapshot,
    candidate: context.candidate,
    utterance: context.utterance,
  }

  const mappedParams =
    typeof spec.paramsFrom === "function"
      ? spec.paramsFrom(actionContext)
      : resolveParamPaths(spec.paramsFrom ?? {}, actionContext)

  return {
    type: context.actionId,
    ...(context.candidate?.params ?? {}),
    ...mappedParams,
  }
}

export function resolveParamPaths(
  paramsFrom: Record<string, string>,
  context: ActionContext
): Record<string, unknown> {
  const params: Record<string, unknown> = {}

  for (const [key, path] of Object.entries(paramsFrom)) {
    params[key] = readPath(
      {
        target: context.target,
        snapshot: context.snapshot,
        page: context.snapshot.page,
        candidate: context.candidate,
      },
      path
    )
  }

  return params
}

export function readPath(source: unknown, path: string): unknown {
  if (!path || path.includes("[") || path.includes("(")) return undefined

  return path.split(".").reduce<unknown>((current, part) => {
    if (current == null || typeof current !== "object") return undefined
    return (current as Record<string, unknown>)[part]
  }, source)
}
