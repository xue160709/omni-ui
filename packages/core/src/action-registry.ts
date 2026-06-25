import type {
  ActionContext,
  ActionPayload,
  DispatchContext,
  InteractionObject,
  InteractionSnapshot,
  RegisteredActionSpec,
  ValidationResult,
} from "./types"

// 中文：判断 action spec 是否可挂到某个对象上，优先使用显式 attachTo，再按执行作用域兜底。
// English: Checks whether an action spec attaches to an object, using attachTo first and executeScope as fallback.
export function actionMatchesObject(
  spec: RegisteredActionSpec,
  object: InteractionObject
): boolean {
  const attachTo = spec.attachTo

  if (attachTo?.id && object.id === attachTo.id) return true
  if (attachTo?.entityType && object.entity?.type === attachTo.entityType) return true
  if (attachTo?.role && object.role === attachTo.role) return true

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
  // 中文：availableWhen 在 snapshot 构建阶段执行，确保对象只暴露当前真正可用的业务 action。
  // English: availableWhen runs during snapshot creation so objects expose only currently valid domain actions.
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
  // 中文：先构造临时 snapshot，让 availableWhen 能看到完整对象集合。
  // English: Builds a provisional snapshot so availableWhen can inspect the full object set.
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
  // 中文：所有执行前都校验 stateVersion，避免用户话音落地时界面已经换了目标。
  // English: Every dispatch validates stateVersion so a command cannot execute against a stale UI target.
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

  const target = snapshot.visibleObjects.find((object) => object.id === context.targetId)
  if (!target) {
    return {
      ok: false,
      code: "target_missing",
      reason: "没有找到对应的操作目标",
    }
  }

  if (!actionMatchesObject(spec, target)) {
    return {
      ok: false,
      code: "action_target_mismatch",
      reason: "该操作不能作用于当前目标",
    }
  }

  if (!target.actions?.includes(context.actionId)) {
    return {
      ok: false,
      code: "capability_missing",
      reason: "当前目标未暴露该操作能力",
    }
  }

  if (target.state?.disabled === true || target.state?.enabled === false) {
    return {
      ok: false,
      code: "target_disabled",
      reason: "当前目标不可用",
    }
  }

  if (spec.requiresConfirmation && context.confirmedActionId !== context.actionId) {
    return {
      ok: false,
      code: "confirmation_required",
      reason: "该操作需要确认",
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
  // 中文：payload 合并解析器参数和 action spec 映射参数，解析器参数先进入，映射参数可覆盖。
  // English: Payload merges resolver params with spec-mapped params; mapped params can override earlier resolver values.
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

// 中文：只支持安全的点路径读取，不执行表达式，也不解析数组/函数调用。
// English: Supports only safe dot-path reads; expressions, arrays, and function calls are intentionally unsupported.
export function readPath(source: unknown, path: string): unknown {
  if (!path || path.includes("[") || path.includes("(")) return undefined

  return path.split(".").reduce<unknown>((current, part) => {
    if (current == null || typeof current !== "object") return undefined
    return (current as Record<string, unknown>)[part]
  }, source)
}
