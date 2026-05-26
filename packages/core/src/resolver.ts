import type {
  IntentResolver,
  IntentResolverContext,
  InteractionObject,
  InteractionSnapshot,
  PrimitiveAction,
  ResolvedInteraction,
} from "./types"

// 中文：内置规则解析器先支持常见中文序数，用于“第一个/第二项”这类低延迟命令。
// English: The built-in rule resolver understands common Chinese ordinals for low-latency commands such as "the first item".
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
  const result = ruleResolver.resolve({ utterance, snapshot }) as ResolvedInteraction
  return result
}

export const ruleResolver: IntentResolver = {
  id: "rule",
  resolve: resolveWithRules,
}

// 中文：按顺序调用多个 resolver，优先返回高置信度结果；如果某个 resolver 要求澄清，则立即交回用户。
// English: Runs resolvers in order, preferring high-confidence results; clarification requests short-circuit back to the user.
export async function resolveWithResolvers(
  context: IntentResolverContext,
  resolvers: IntentResolver[],
  minimumConfidence = 0.8
): Promise<ResolvedInteraction> {
  for (const resolver of resolvers) {
    const rawResult = await resolver.resolve(context)
    const candidates = Array.isArray(rawResult) ? rawResult : [rawResult]
    const resolved = candidates
      .filter((candidate) => candidate.status === "resolved")
      .sort((a, b) => b.confidence - a.confidence)[0]

    if (resolved && resolved.confidence >= minimumConfidence) {
      return {
        ...resolved,
        resolverId: resolved.resolverId ?? resolver.id,
      }
    }

    const clarification = candidates.find((candidate) => candidate.status === "needs_clarification")
    if (clarification) {
      return {
        ...clarification,
        resolverId: clarification.resolverId ?? resolver.id,
      }
    }
  }

  return {
    status: "not_found",
    utterance: context.utterance,
    confidence: 0,
    reason: "没有 resolver 能识别该表达",
  }
}

// 中文：内置规则解析流程：先猜意图，再解析序号/文本目标，最后为目标挑选动作。
// English: Built-in resolution flow: infer intent, resolve ordinal/text target, then choose an action for that target.
function resolveWithRules({
  utterance,
  snapshot,
}: IntentResolverContext): ResolvedInteraction {
  const text = utterance.trim()
  const intent = inferIntent(text)
  const dialog = resolveDialogIntent(text, intent, snapshot)
  if (dialog) return dialog

  const ordinal = extractOrdinal(text)
  const targetByOrdinal = ordinal ? findObjectByOrdinal(snapshot, ordinal) : undefined
  const targetText = ordinal ? "" : extractTargetText(text, intent)
  const targetByReference = isDeicticReference(text, targetText)
    ? findObjectByRecentReference(snapshot)
    : undefined

  const selectTarget =
    intent === "select"
      ? ordinal
        ? findSelectableControl(snapshot)
        : findSelectableControlByOption(snapshot, targetText)
      : undefined
  const target =
    targetByOrdinal ??
    targetByReference ??
    selectTarget ??
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

  const action = chooseAction(target, intent, { ordinal, targetText })
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
    confidence: ordinal ? 0.88 : targetByReference ? 0.86 : 0.78,
    resolverId: "rule",
  }
}

// 中文：通过中文动词快速推断用户意图，作为无配置规则时的本地兜底。
// English: Infers intent from Chinese verbs as a local fallback when no configured rules match.
export function inferIntent(text: string): string {
  if (/确认|确定|好的|好/.test(text)) return "confirm"
  if (/^(点击|点一下|点|按一下|按)/.test(text)) return "click"
  if (/取消完成|取消勾选/.test(text)) return "uncomplete"
  if (/取消|算了|关闭弹窗/.test(text)) return "cancel"
  if (/删除|移除|删掉/.test(text)) return "delete"
  if (/完成|勾选|标记完成/.test(text)) return "complete"
  if (/关闭|关掉/.test(text)) return "close"
  if (/打开|开启|开/.test(text)) return "open"
  if (/选择|切到|切换|只看|显示/.test(text)) return "select"
  if (/^(回到|返回|去|进入|前往|跳转|导航到)/.test(text)) return "navigate"
  if (/调高|增大|加/.test(text)) return "increase"
  if (/调低|减小|降低/.test(text)) return "decrease"
  if (/添加|新增|创建/.test(text)) return "add"
  return "click"
}

// 中文：解析“第 2 个”和“第二项”两种序号表达，序号从 1 开始。
// English: Parses both digit and Chinese-word ordinals; the returned index is one-based.
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
  // 中文：业务列表项优先按 state.index 排序，避免 DOM 顺序变化影响“第几个”的语义。
  // English: Business list items are sorted by state.index so "nth item" is stable even if DOM order shifts.
  const listItem = snapshot.visibleObjects
    .filter((object) => object.role === "list_item" || object.type === "composite")
    .sort((a, b) => Number(a.state?.index ?? 9999) - Number(b.state?.index ?? 9999))
    .find((object) => object.state?.index === ordinal || object.aliases?.some((alias) => alias.includes(`第 ${ordinal}`)))

  if (listItem) return listItem

  return snapshot.visibleObjects
    .filter((object) => ["tab", "option", "menuitem", "command_item"].includes(object.role))
    .at(ordinal - 1)
}

export function findObjectBySpokenText(
  snapshot: InteractionSnapshot,
  text: string
): InteractionObject | undefined {
  const query = normalizeSpeech(text)
  if (!query) return undefined

  const objects = snapshot.visibleObjects.filter((object) => object.type !== "page")

  // 中文：先做精确命中，再做包含关系命中，减少短词误匹配。
  // English: Exact matches run before containment matches to reduce false positives from short phrases.
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

function findSelectableControl(snapshot: InteractionSnapshot): InteractionObject | undefined {
  return snapshot.visibleObjects.find((object) => object.primitiveActions?.includes("selectByIndex"))
}

function findSelectableControlByOption(
  snapshot: InteractionSnapshot,
  text: string
): InteractionObject | undefined {
  const query = normalizeSpeech(text)
  if (!query) return undefined

  return snapshot.visibleObjects.find((object) => {
    if (!object.primitiveActions?.includes("selectByLabel")) return false
    const options = object.state?.options
    if (!Array.isArray(options)) return false

    return options.some((option) => {
      if (!option || typeof option !== "object") return false
      const optionRecord = option as Record<string, unknown>
      return [optionRecord.label, optionRecord.value]
        .filter((value): value is string => typeof value === "string")
        .some((value) => {
          const normalized = normalizeSpeech(value)
          return normalized === query || normalized.includes(query) || query.includes(normalized)
        })
    })
  })
}

function resolveDialogIntent(
  text: string,
  intent: string,
  snapshot: InteractionSnapshot
): ResolvedInteraction | undefined {
  if (intent !== "cancel" && intent !== "confirm") return undefined

  // 中文：弹窗上下文采用 modal_first 策略，“确认/取消”优先落到最上层弹窗内的按钮。
  // English: Dialog context uses a modal-first policy so "confirm/cancel" targets the topmost dialog button.
  const modalContext = [...snapshot.contextStack].reverse().find((context) => context.type === "modal")
  if (!modalContext) return undefined

  const dialog = snapshot.visibleObjects.find((object) => object.id === modalContext.id)
  const childIds = new Set(dialog?.children ?? [])
  const target = snapshot.visibleObjects.find((object) => {
    if (!childIds.has(object.id)) return false
    const names = getSpokenNames(object).map(normalizeSpeech)
    if (intent === "cancel") return names.some((name) => /取消|关闭/.test(name))
    return names.some((name) => /确认|确定|好的|好/.test(name))
  })

  if (!target) return undefined

  const action = chooseAction(target, intent)
  return {
    status: "resolved",
    utterance: text,
    intent,
    targetId: target.id,
    ...(action ?? { primitiveAction: "press" }),
    confidence: 0.93,
    reason: `modal_first:${modalContext.id}`,
    resolverId: "rule",
  }
}

function extractTargetText(text: string, intent: string): string {
  // 中文：只去掉命令动词，保留业务名词，便于后续按 label/alias 找对象。
  // English: Removes command verbs while preserving business nouns for later label/alias matching.
  const commandWords: Record<string, RegExp> = {
    click: /^(点击|点一下|点|按一下|按)/,
    open: /^(打开|开启|开)/,
    close: /^(关闭|关掉|关)/,
    delete: /^(删除|移除|删掉)/,
    complete: /^(把)?(.*?)(标记完成|完成|勾选)$/,
    uncomplete: /^(取消完成|取消勾选)/,
    select: /^(选择|切到|切换到|显示|只看)/,
    navigate: /^(回到|返回到?|返回|去|进入|前往|跳转到?|导航到?)/,
    increase: /^(调高|增大|加大)/,
    decrease: /^(调低|减小|降低)/,
    add: /^(添加|新增|创建)/,
  }

  if (intent === "complete") {
    return (
      extractTargetFromCompletionText(text, [
        /^(?:帮我|请|麻烦)?(?:把|将)?(.+?)(?:标记为?完成|改成完成|改为完成|设为完成|置为完成|完成|勾选)$/,
        /^(?:完成|勾选)(.+)$/,
      ]) ?? text
    )
  }

  if (intent === "uncomplete") {
    return (
      extractTargetFromCompletionText(text, [
        /^(?:帮我|请|麻烦)?(?:把|将)?(.+?)(?:取消完成|取消勾选|标记为?未完成|改成未完成|改为未完成|设为未完成|恢复未完成)$/,
        /^(?:取消完成|取消勾选|恢复)(.+)$/,
      ]) ?? text.replace(commandWords.uncomplete, "").trim()
    )
  }

  return text.replace(commandWords[intent] ?? /$^/, "").trim()
}

function extractTargetFromCompletionText(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    const target = cleanupTargetText(match?.[1])
    if (target) return target
  }
  return undefined
}

function cleanupTargetText(value: string | undefined): string | undefined {
  const cleaned = value
    ?.replace(/^(帮我|请|麻烦|把|将|给我)+/, "")
    .replace(/(这个|那个|这项|那项|该项|此项)$/g, "")
    .trim()
  return cleaned || undefined
}

function isDeicticReference(text: string, targetText: string): boolean {
  const normalizedTarget = normalizeSpeech(targetText)
  return (
    /这个|那个|这里|那里|这项|那项|该项|此项|它|它们/.test(text) ||
    /^(this|that|here|there|it|these|those)$/i.test(normalizedTarget)
  )
}

function findObjectByRecentReference(snapshot: InteractionSnapshot): InteractionObject | undefined {
  const now = Date.now()
  const references = [...(snapshot.recentReferences ?? [])]
    .filter((reference) => now - reference.timestamp < 5000)
    .sort((a, b) => b.timestamp - a.timestamp || b.confidence - a.confidence)

  for (const reference of references) {
    const object = snapshot.visibleObjects.find((item) => item.id === reference.objectId)
    if (object) return object
  }

  return snapshot.focus
    ? snapshot.visibleObjects.find((object) => object.id === snapshot.focus?.objectId)
    : undefined
}

function chooseAction(
  object: InteractionObject,
  intent: string,
  options: { ordinal?: number; targetText?: string } = {}
): { actionId?: string; primitiveAction?: PrimitiveAction; params?: Record<string, unknown> } | undefined {
  const actions = object.actions ?? []
  const primitiveActions = object.primitiveActions ?? []

  // 中文：优先选择业务 action；只有没有匹配时才回退到 DOM primitive，确保业务逻辑可统一校验。
  // English: Domain actions are preferred; DOM primitives are fallback paths so business logic stays centrally validated.
  const domain = (suffixes: string[]) =>
    actions.find((action) =>
      suffixes.some((suffix) =>
        suffix.startsWith(".")
          ? action.endsWith(suffix)
          : action === suffix || action.endsWith(`.${suffix}`)
      )
    )
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
    const actionId = domain([".open", ".goto", ".navigate", "open", "turnOn", "goto", "navigate"])
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
    const actionId = domain([".filter", ".select", ".goto", ".navigate", "switchTo", "goto", "navigate"])
    if (actionId) return { actionId }
    if (options.ordinal && primitiveActions.includes("selectByIndex")) {
      return { primitiveAction: "selectByIndex", params: { index: options.ordinal } }
    }
    if (options.targetText && primitiveActions.includes("selectByLabel")) {
      return { primitiveAction: "selectByLabel", params: { label: options.targetText } }
    }
    const primitiveAction = primitive(["select", "selectByLabel", "switchTo", "press"])
    if (primitiveAction) return { primitiveAction }
  }

  if (intent === "navigate") {
    const actionId = domain([".goto", ".navigate", ".open", "goto", "navigate", "open", "switchTo"])
    if (actionId) return { actionId }
    const primitiveAction = primitive(["press", "open", "switchTo", "select"])
    if (primitiveAction) return { primitiveAction }
  }

  if (intent === "confirm") {
    const actionId = domain([".confirm", "confirm"])
    if (actionId) return { actionId }
    const primitiveAction = primitive(["confirm", "press", "select"])
    if (primitiveAction) return { primitiveAction }
  }

  if (intent === "cancel") {
    const actionId = domain([".cancel", "cancel", ".close"])
    if (actionId) return { actionId }
    const primitiveAction = primitive(["cancel", "close", "press"])
    if (primitiveAction) return { primitiveAction }
  }

  if (intent === "increase") {
    const actionId = domain([".increase", "increase"])
    if (actionId) return { actionId }
    const primitiveAction = primitive(["increase"])
    if (primitiveAction) return { primitiveAction }
  }

  if (intent === "decrease") {
    const actionId = domain([".decrease", "decrease"])
    if (actionId) return { actionId }
    const primitiveAction = primitive(["decrease"])
    if (primitiveAction) return { primitiveAction }
  }

  if (intent === "add") {
    const actionId = domain([".add", "add"])
    if (actionId) return { actionId }
  }

  if (["complete", "uncomplete", "delete", "increase", "decrease", "add"].includes(intent)) {
    return undefined
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
  // 中文：语音文本归一化会去掉常见标点和指示词，让“点这个提交”能命中“提交”。
  // English: Speech normalization removes common punctuation and deixis so phrases like "click this submit" match "submit".
  return value
    .toLowerCase()
    .replace(/[，。！？、,.!?:：；;\s"'“”‘’]/g, "")
    .replace(/^这个/, "")
}
