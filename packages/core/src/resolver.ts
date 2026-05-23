import type {
  InteractionObject,
  InteractionSnapshot,
  PrimitiveAction,
  ResolvedInteraction,
} from "./types"

const ordinalWords: Record<string, number> = {
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
}

export function resolveUtterance(
  utterance: string,
  snapshot: InteractionSnapshot
): ResolvedInteraction {
  const text = utterance.trim()
  const filter = resolveFilterIntent(text, snapshot)
  if (filter) return filter

  const add = resolveAddIntent(text, snapshot)
  if (add) return add

  const intent = inferIntent(text)
  const ordinal = extractOrdinal(text)
  const targetByOrdinal = ordinal ? findObjectByOrdinal(snapshot, ordinal) : undefined
  const targetText = ordinal ? "" : extractTargetText(text, intent)
  const target =
    targetByOrdinal ??
    findObjectBySpokenText(snapshot, targetText) ??
    findObjectBySpokenText(snapshot, text)

  if (!target) {
    return {
      status: "not_found",
      utterance,
      intent,
      confidence: 0,
      reason: "没有找到可见对象",
    }
  }

  const action = chooseAction(target, intent)
  if (!action) {
    return {
      status: "not_found",
      utterance,
      intent,
      targetId: target.id,
      confidence: 0.3,
      reason: "目标对象当前没有可执行动作",
    }
  }

  return {
    status: "resolved",
    utterance,
    intent,
    targetId: target.id,
    ...action,
    confidence: ordinal ? 0.88 : 0.78,
  }
}

export function inferIntent(text: string): string {
  if (/删除|移除|删掉/.test(text)) return "delete"
  if (/完成|勾选|标记完成/.test(text)) return "complete"
  if (/取消完成|取消勾选/.test(text)) return "uncomplete"
  if (/关闭|关掉/.test(text)) return "close"
  if (/打开|开启|开/.test(text)) return "open"
  if (/选择|切到|切换|只看|显示/.test(text)) return "select"
  if (/调高|增大|加/.test(text)) return "increase"
  if (/调低|减小|降低/.test(text)) return "decrease"
  if (/添加|新增|创建/.test(text)) return "add"
  return "click"
}

export function extractOrdinal(text: string): number | undefined {
  const digitMatch = text.match(/第\s*(\d+)\s*(个|项|条|行)?/)
  if (digitMatch) return Number(digitMatch[1])

  const wordMatch = text.match(/第\s*([一二两三四五六七八九十])\s*(个|项|条|行)?/)
  if (wordMatch) return ordinalWords[wordMatch[1]]

  return undefined
}

export function findObjectByOrdinal(
  snapshot: InteractionSnapshot,
  ordinal: number
): InteractionObject | undefined {
  return snapshot.visibleObjects
    .filter((object) => object.role === "list_item" || object.type === "composite")
    .sort((a, b) => Number(a.state?.index ?? 9999) - Number(b.state?.index ?? 9999))
    .find((object) => object.state?.index === ordinal || object.aliases?.some((alias) => alias.includes(`第 ${ordinal}`)))
}

export function findObjectBySpokenText(
  snapshot: InteractionSnapshot,
  text: string
): InteractionObject | undefined {
  const query = normalizeSpeech(text)
  if (!query) return undefined

  const objects = snapshot.visibleObjects.filter((object) => object.type !== "page")

  return (
    objects.find((object) =>
      getSpokenNames(object).some((name) => normalizeSpeech(name) === query)
    ) ??
    objects.find((object) =>
      getSpokenNames(object).some((name) => {
        const normalized = normalizeSpeech(name)
        return normalized.includes(query) || query.includes(normalized)
      })
    )
  )
}

function resolveFilterIntent(
  text: string,
  snapshot: InteractionSnapshot
): ResolvedInteraction | undefined {
  const filter = /未完成|待办|进行中/.test(text)
    ? "active"
    : /已完成|完成的/.test(text)
      ? "completed"
      : /全部|所有/.test(text)
        ? "all"
        : undefined

  if (!filter || !/只看|显示|筛选|过滤|切到|切换/.test(text)) return undefined

  const target = snapshot.visibleObjects.find(
    (object) => object.role === "filter_tabs" || object.actions?.some((action) => action.endsWith(".filter"))
  )
  const actionId = target?.actions?.find((action) => action.endsWith(".filter"))

  if (!target || !actionId) return undefined

  return {
    status: "resolved",
    utterance: text,
    intent: "filter",
    targetId: target.id,
    actionId,
    params: { filter },
    confidence: 0.94,
  }
}

function resolveAddIntent(
  text: string,
  snapshot: InteractionSnapshot
): ResolvedInteraction | undefined {
  if (!/添加|新增|创建/.test(text)) return undefined

  const title = text.split(/[:：]/).slice(1).join("：").trim()
  const target = snapshot.visibleObjects.find(
    (object) => object.role === "composer" || object.actions?.some((action) => action.endsWith(".add"))
  )
  const actionId = target?.actions?.find((action) => action.endsWith(".add"))

  if (!target || !actionId) return undefined

  return {
    status: "resolved",
    utterance: text,
    intent: "add",
    targetId: target.id,
    actionId,
    params: title ? { title } : {},
    confidence: title ? 0.92 : 0.72,
  }
}

function extractTargetText(text: string, intent: string): string {
  const commandWords: Record<string, RegExp> = {
    click: /^(点击|点一下|点|按一下|按)/,
    open: /^(打开|开启|开)/,
    close: /^(关闭|关掉|关)/,
    delete: /^(删除|移除|删掉)/,
    complete: /^(把)?(.*?)(标记完成|完成|勾选)$/,
    uncomplete: /^(取消完成|取消勾选)/,
    select: /^(选择|切到|切换到|显示|只看)/,
    increase: /^(调高|增大|加大)/,
    decrease: /^(调低|减小|降低)/,
    add: /^(添加|新增|创建)/,
  }

  if (intent === "complete") {
    const match = text.match(commandWords.complete)
    return match?.[2]?.replace(/^把/, "").trim() ?? text
  }

  return text.replace(commandWords[intent] ?? /$^/, "").trim()
}

function chooseAction(
  object: InteractionObject,
  intent: string
): { actionId?: string; primitiveAction?: PrimitiveAction; params?: Record<string, unknown> } | undefined {
  const actions = object.actions ?? []
  const primitiveActions = object.primitiveActions ?? []

  const domain = (suffixes: string[]) =>
    actions.find((action) => suffixes.some((suffix) => action.endsWith(suffix) || action.includes(suffix)))
  const primitive = (candidates: PrimitiveAction[]) =>
    primitiveActions.find((action) => candidates.includes(action))

  if (intent === "complete") {
    const actionId = domain([".complete", "complete"])
    if (actionId) return { actionId }
    const primitiveAction = primitive(["check", "toggle"])
    if (primitiveAction) return { primitiveAction }
  }

  if (intent === "uncomplete") {
    const actionId = domain([".uncomplete", "uncomplete"])
    if (actionId) return { actionId }
    const primitiveAction = primitive(["uncheck", "toggle"])
    if (primitiveAction) return { primitiveAction }
  }

  if (intent === "delete") {
    const actionId = domain([".delete", "delete"])
    if (actionId) return { actionId }
  }

  if (intent === "open") {
    const actionId = domain([".open", ".turnOn", "open", "turnOn"])
    if (actionId) return { actionId }
    const primitiveAction = primitive(["turnOn", "open", "toggle", "press"])
    if (primitiveAction) return { primitiveAction }
  }

  if (intent === "close") {
    const actionId = domain([".close", ".turnOff", "close", "turnOff", "cancel"])
    if (actionId) return { actionId }
    const primitiveAction = primitive(["turnOff", "close", "cancel", "toggle", "press"])
    if (primitiveAction) return { primitiveAction }
  }

  if (intent === "select") {
    const actionId = domain([".filter", ".select", "switchTo"])
    if (actionId) return { actionId }
    const primitiveAction = primitive(["select", "selectByLabel", "switchTo", "press"])
    if (primitiveAction) return { primitiveAction }
  }

  if (intent === "increase") {
    const primitiveAction = primitive(["increase"])
    if (primitiveAction) return { primitiveAction }
  }

  if (intent === "decrease") {
    const primitiveAction = primitive(["decrease"])
    if (primitiveAction) return { primitiveAction }
  }

  if (intent === "add") {
    const actionId = domain([".add", "add"])
    if (actionId) return { actionId }
  }

  const actionId = domain([".confirm", ".add", ".open"])
  if (actionId) return { actionId }

  const primitiveAction = primitive(["press", "confirm", "select", "focus"])
  if (primitiveAction) return { primitiveAction }

  return undefined
}

function getSpokenNames(object: InteractionObject): string[] {
  return [object.label, ...(object.aliases ?? [])].filter(Boolean) as string[]
}

function normalizeSpeech(value: string): string {
  return value
    .toLowerCase()
    .replace(/[，。！？、,.!?:：；;\s"'“”‘’]/g, "")
    .replace(/^这个/, "")
}
