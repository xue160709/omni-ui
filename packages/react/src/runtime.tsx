import {
  buildActionPayload,
  compactSnapshotForIntent,
  createConfiguredRuleResolver,
  createInteractionSnapshot,
  mergeInteractionManifests,
  normalizeConfiguredRules,
  resolveUtterance,
  resolveWithResolvers,
  ruleResolver,
  validateActionRequest,
  type ActionContext,
  type ActionExecutor,
  type ActionPayload,
  type AppInteractionManifest,
  type DomainActionSpec,
  type EntityRef,
  type InteractionHint,
  type InteractionObject,
  type InteractionResolutionResult,
  type InteractionSnapshot,
  type InteractionSubmitOptions,
  type InteractionSubmitResult,
  type LocalInteractionRule,
  type MultimodalConfig,
  type PageObject,
  type RegisteredActionSpec,
  type ResolverMode,
  type IntentResolver,
  type ResolvedInteraction,
} from "@omni-ui/core"
import * as React from "react"
import {
  applyPrimitiveAction,
  extractDomNodes,
  getElementLabel,
  getElementState,
  hintToAliases,
  inferPrimitiveActions,
  isElementVisible,
} from "./dom"

type RegisteredNode = {
  id: string
  role: string
  label?: string
  labelFrom?: "text" | "aria" | "none"
  actions?: string[]
  hint?: InteractionHint
  state?: Record<string, unknown>
  element: HTMLElement
}

// 中文：Group 表示业务边界，如列表、列表项、弹窗或表单字段，可把多个原始控件组织成一个语义对象。
// English: A group represents a business boundary, such as a list, item, dialog, or form field, grouping raw controls semantically.
type RegisteredGroup = {
  id: string
  role: string
  label?: string
  aliases?: string[]
  entity?: EntityRef
  state?: Record<string, unknown>
  indexBy?: "visible_order"
  element: HTMLElement
}

type RegisteredPage = {
  id: string
  title: string
  route?: string
  state?: Record<string, unknown>
}

type RegisteredVirtualObject = InteractionObject

type ActionRegistration = {
  namespace: string
  actions: Record<string, DomainActionSpec>
  execute?: ActionExecutor
}

type RuntimeContextValue = {
  snapshot: InteractionSnapshot
  lastResolution?: ResolvedInteraction
  getSnapshot: () => InteractionSnapshot
  resolveText: (text: string) => Promise<InteractionResolutionResult>
  dispatchResolution: (
    resolution: ResolvedInteraction,
    options?: InteractionSubmitOptions
  ) => Promise<InteractionSubmitResult>
  submitUtterance: (text: string, options?: InteractionSubmitOptions) => Promise<InteractionSubmitResult>
  registerNode: (node: RegisteredNode) => () => void
  registerGroup: (group: RegisteredGroup) => () => void
  registerObject: (object: RegisteredVirtualObject) => () => void
  registerManifest: (id: string, manifest: AppInteractionManifest) => () => void
  registerPage: (page: RegisteredPage) => () => void
  registerActions: (registration: ActionRegistration) => () => void
}

// 中文：对外暴露的 API 只包含读取 snapshot、解析文本和提交执行，不暴露内部注册表。
// English: The public API exposes snapshot reads, text resolution, and dispatch only, keeping internal registries private.
export type InteractionApi = Pick<
  RuntimeContextValue,
  "snapshot" | "lastResolution" | "getSnapshot" | "resolveText" | "dispatchResolution" | "submitUtterance"
>

const emptySnapshot: InteractionSnapshot = createInteractionSnapshot({
  stateVersion: 0,
  visibleObjects: [],
})

const RuntimeContext = React.createContext<RuntimeContextValue | null>(null)

export type MultimodalProviderProps = {
  children: React.ReactNode
  config?: MultimodalConfig
  language?: string
  device?: string
  manifest?: AppInteractionManifest
  localRules?: LocalInteractionRule[]
  resolvers?: IntentResolver[]
  resolverMode?: ResolverMode
  onResolution?: (resolution: ResolvedInteraction) => void
  onClarification?: (resolution: ResolvedInteraction) => void
}

export function MultimodalProvider(props: MultimodalProviderProps) {
  const {
    children,
    config,
    device,
    language,
    localRules,
    manifest,
    onClarification,
    onResolution,
    resolverMode = "rule-first",
    resolvers,
  } = props
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  // 中文：objectId 到 DOM 的映射只存在本地，用于 primitive 执行和反馈动画，不进入 snapshot。
  // English: objectId-to-DOM mapping stays local for primitive execution and feedback animation; it is not serialized into snapshots.
  const elementByObjectId = React.useRef(new Map<string, HTMLElement>())
  const snapshotRef = React.useRef<InteractionSnapshot>(emptySnapshot)
  const [version, setVersion] = React.useState(0)
  const [nodes, setNodes] = React.useState(() => new Map<string, RegisteredNode>())
  const [groups, setGroups] = React.useState(() => new Map<string, RegisteredGroup>())
  const [objects, setObjects] = React.useState(() => new Map<string, RegisteredVirtualObject>())
  const [manifests, setManifests] = React.useState(() => new Map<string, AppInteractionManifest>())
  const [page, setPage] = React.useState<RegisteredPage | undefined>()
  const [actions, setActions] = React.useState(() => new Map<string, ActionRegistration>())
  const [lastResolution, setLastResolution] = React.useState<ResolvedInteraction | undefined>()

  const bumpVersion = React.useCallback(() => setVersion((current) => current + 1), [])

  React.useEffect(() => {
    bumpVersion()
  }, [bumpVersion])

  React.useEffect(() => {
    const root = rootRef.current
    if (!root) return

    // 中文：DOM 变化和表单事件都会推动 stateVersion 递增，确保执行前能发现快照过期。
    // English: DOM mutations and form events bump stateVersion so dispatch can detect stale snapshots before executing.
    const observer = new MutationObserver((mutations) => {
      if (mutations.some(shouldObserveMutation)) bumpVersion()
    })
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "aria-label",
        "aria-checked",
        "aria-expanded",
        "aria-pressed",
        "aria-selected",
        "aria-disabled",
        "aria-hidden",
        "disabled",
        "hidden",
        "open",
        "data-state",
        "data-mm-label",
        "data-mm-role",
      ],
    })

    let queuedRuntimeBump = false
    let runtimeBumpTimer: number | undefined
    const scheduleRuntimeBump = () => {
      if (queuedRuntimeBump) return
      queuedRuntimeBump = true
      const view = root.ownerDocument.defaultView
      if (!view) {
        queuedRuntimeBump = false
        bumpVersion()
        return
      }
      runtimeBumpTimer = view.setTimeout(() => {
        queuedRuntimeBump = false
        runtimeBumpTimer = undefined
        bumpVersion()
      }, 0)
    }

    const handleRuntimeEvent = (event: Event) => {
      if (isIgnoredRuntimeTarget(event.target)) return
      scheduleRuntimeBump()
    }

    root.addEventListener("focusin", handleRuntimeEvent)
    root.addEventListener("focusout", handleRuntimeEvent)
    root.addEventListener("input", handleRuntimeEvent)
    root.addEventListener("change", handleRuntimeEvent)

    return () => {
      observer.disconnect()
      root.removeEventListener("focusin", handleRuntimeEvent)
      root.removeEventListener("focusout", handleRuntimeEvent)
      root.removeEventListener("input", handleRuntimeEvent)
      root.removeEventListener("change", handleRuntimeEvent)
      if (runtimeBumpTimer !== undefined) {
        root.ownerDocument.defaultView?.clearTimeout(runtimeBumpTimer)
      }
    }
  }, [bumpVersion])

  const actionSpecs = React.useMemo(() => {
    // 中文：namespace 只用于组织和 manifest 元数据，真正执行时仍以 action id 查找 spec。
    // English: namespace is organizational metadata; dispatch still looks up specs by action id.
    const specs: Record<string, RegisteredActionSpec> = {}
    actions.forEach((registration) => {
      Object.entries(registration.actions).forEach(([id, spec]) => {
        specs[id] = {
          ...spec,
          id,
          namespace: registration.namespace,
          execute: spec.execute ?? registration.execute,
        }
      })
    })
    return specs
  }, [actions])

  const effectiveManifest = React.useMemo(
    () =>
      mergeInteractionManifests(
        config?.manifest,
        manifest,
        ...Array.from(manifests.values())
      ),
    [config?.manifest, manifest, manifests]
  )

  const configuredRuleSignature = stableStringify({
    configRules: config?.rules,
    localRules,
  })
  const localResolvers = React.useMemo(() => {
    const rules = [
      ...normalizeConfiguredRules(config?.rules),
      ...(localRules ?? []),
    ]
    const configuredResolver = rules.length
      ? createConfiguredRuleResolver({ rules })
      : undefined
    return configuredResolver ? [configuredResolver] : undefined
  }, [configuredRuleSignature, config?.rules, localRules])

  const snapshot = React.useMemo(() => {
    const elementMap = new Map<string, HTMLElement>()
    const root = rootRef.current
    const rawObjects: InteractionObject[] = []

    // 中文：显式注册节点优先保留开发者提供的 id、role、label 和动作语义。
    // English: Explicitly registered nodes preserve developer-provided id, role, label, and action semantics.
    nodes.forEach((node) => {
      if (!isElementVisible(node.element)) return
      elementMap.set(node.id, node.element)
      rawObjects.push({
        id: node.id,
        type: "raw",
        role: node.role,
        label: resolveRegisteredNodeLabel(node),
        aliases: hintToAliases(node.hint),
        source: "registered",
        state: {
          ...getElementState(node.element),
          ...(node.state ?? {}),
        },
        primitiveActions: (node.actions ?? inferPrimitiveActions(node.role, node.element)) as string[],
      })
    })

    if (root) {
      // 中文：未显式注册的可交互 DOM 会自动进入 snapshot，降低接入成本。
      // English: Unregistered interactive DOM is auto-discovered into the snapshot to reduce integration cost.
      extractDomNodes(root).forEach(({ object, element }) => {
        elementMap.set(object.id, element)
        rawObjects.push(object)
      })
    }

    const virtualObjects = Array.from(objects.values()).map((object) => ({
      ...object,
      source: object.source ?? "registered_object",
    }))
    const groupObjects = buildGroupObjects(groups, rawObjects, elementMap)
    groupObjects.forEach((object) => {
      const group = groups.get(object.id)
      if (group) elementMap.set(object.id, group.element)
    })

    const pageObject: PageObject | undefined = page
      ? {
          id: page.id,
          type: "page",
          role: "page",
          label: page.title,
          title: page.title,
          route: page.route,
          state: page.state,
          source: "registered",
        }
      : undefined

    const activeElement = root?.ownerDocument.activeElement as HTMLElement | null
    const focusedNode =
      activeElement &&
      [...elementMap.entries()].find(([, element]) => element === activeElement || element.contains(activeElement))

    const modalContexts = groupObjects
      .filter(
        (object) =>
          (object.role === "dialog" || object.role === "alertdialog") &&
          isModalGroupActive(object, groups)
      )
      .map((object) => ({
        type: "modal" as const,
        id: object.id,
        title: object.label,
        scopePolicy: "modal_first" as const,
        blocksGlobalActions: true,
      }))

    const pageContext = pageObject
      ? [
          {
            type: "page" as const,
            id: pageObject.id,
            title: pageObject.title,
          },
        ]
      : []

    // 中文：当前 snapshot 是所有注册源和 DOM 源的汇总，也是 resolver 与 dispatch 共用的事实来源。
    // English: The current snapshot is the shared source of truth for both resolution and dispatch.
    const builtSnapshot = createInteractionSnapshot({
      stateVersion: version,
      manifest: effectiveManifest,
      page: pageObject,
      contextStack: [...pageContext, ...modalContexts],
      visibleObjects: [...virtualObjects, ...groupObjects, ...rawObjects],
      focus: focusedNode
        ? {
            objectId: focusedNode[0],
            source: "gui",
            confidence: 1,
          }
        : undefined,
      actionSpecs,
      session: {
        language: language ?? "zh-CN",
        device: device ?? "desktop",
      },
    })

    elementByObjectId.current = elementMap
    snapshotRef.current = builtSnapshot
    return builtSnapshot
  }, [actionSpecs, device, effectiveManifest, groups, language, nodes, objects, page, version])

  const applyFeedback = React.useCallback((targetId: string, phase: string) => {
    // 中文：反馈通过 data-mm-feedback 暂态属性驱动 CSS，不要求宿主应用维护额外状态。
    // English: Feedback uses a transient data-mm-feedback attribute so host apps do not need extra state.
    const element = elementByObjectId.current.get(targetId)
    if (!element) return

    const view = element.ownerDocument.defaultView
    if (!view) return

    element.dataset.mmFeedback = phase
    view.setTimeout(() => {
      if (element.dataset.mmFeedback === phase) {
        delete element.dataset.mmFeedback
      }
    }, phase === "voice-target" ? 380 : 520)
  }, [])

  const getSnapshot = React.useCallback(() => snapshotRef.current, [])

  const resolveText = React.useCallback(
    async (text: string): Promise<InteractionResolutionResult> => {
      // 中文：解析总是基于提交瞬间的 snapshot，并记录 lastResolution 方便调试或 UI 展示。
      // English: Resolution uses the snapshot at submit time and stores lastResolution for debugging or UI display.
      const currentSnapshot = snapshotRef.current
      const resolution = await resolveCandidate(text, currentSnapshot, {
        localResolvers,
        resolvers,
        resolverMode,
      })
      setLastResolution(resolution)
      onResolution?.(resolution)

      if (resolution.status === "needs_clarification") {
        onClarification?.(resolution)
      }

      return {
        snapshot: currentSnapshot,
        resolution,
      }
    },
    [localResolvers, onClarification, onResolution, resolverMode, resolvers]
  )

  const dispatchResolution = React.useCallback(
    async (
      resolution: ResolvedInteraction,
      options: InteractionSubmitOptions = {}
    ): Promise<InteractionSubmitResult> => {
      // 中文：dispatch 只执行已解析结果；目标、动作或 stateVersion 不满足校验时会返回错误。
      // English: Dispatch executes resolved results only; invalid target, action, or stateVersion returns an error.
      const currentSnapshot = snapshotRef.current
      const baseResult = {
        snapshot: currentSnapshot,
        resolution,
      }

      if (resolution.status !== "resolved" || !resolution.targetId) {
        return {
          ...baseResult,
          ok: false,
          executed: false,
          error: resolution.reason ?? "No resolved interaction target.",
        }
      }

      if (resolution.actionId) {
        // 中文：业务 action 先走 core 校验，再构造 payload 并交给注册 executor。
        // English: Domain actions pass core validation first, then build a payload and call the registered executor.
        const validation = validateActionRequest(currentSnapshot, {
          actionId: resolution.actionId,
          targetId: resolution.targetId,
          baseStateVersion: options.baseStateVersion ?? currentSnapshot.stateVersion,
          confirmedActionId: options.confirmedActionId,
          candidate: resolution,
          utterance: resolution.utterance,
        })

        if (!validation.ok) {
          applyFeedback(resolution.targetId, "error")
          return {
            ...baseResult,
            ok: false,
            executed: false,
            validation,
            error: validation.reason,
          }
        }

        const action = buildActionPayload(currentSnapshot, {
          actionId: resolution.actionId,
          targetId: resolution.targetId,
          baseStateVersion: options.baseStateVersion ?? currentSnapshot.stateVersion,
          confirmedActionId: options.confirmedActionId,
          candidate: resolution,
          utterance: resolution.utterance,
        })
        const spec = currentSnapshot.actionSpecs[resolution.actionId]
        const target = currentSnapshot.visibleObjects.find((object) => object.id === resolution.targetId)

        if (!spec?.execute || !target) {
          applyFeedback(resolution.targetId, "error")
          return {
            ...baseResult,
            ok: false,
            executed: false,
            target,
            action,
            error: "No executor is registered for the resolved action.",
          }
        }

        try {
          applyFeedback(resolution.targetId, "voice-target")
          applyFeedback(resolution.targetId, "voice-press")
          await spec.execute(action as ActionPayload, {
            actionId: resolution.actionId,
            target,
            snapshot: currentSnapshot,
            candidate: resolution,
            utterance: resolution.utterance,
          } satisfies ActionContext)
          applyFeedback(resolution.targetId, "success")
          bumpVersion()
          return {
            ...baseResult,
            ok: true,
            executed: true,
            execution: "domain-action",
            target,
            action,
          }
        } catch (error) {
          applyFeedback(resolution.targetId, "error")
          return {
            ...baseResult,
            ok: false,
            executed: false,
            target,
            action,
            error: error instanceof Error ? error.message : "Action execution failed.",
          }
        }
      }

      if (resolution.primitiveAction) {
        // 中文：primitive action 直接作用在 DOM 节点上，只在没有业务 action 时作为低层能力使用。
        // English: Primitive actions operate on DOM nodes directly and are intended as a low-level fallback.
        const target = currentSnapshot.visibleObjects.find((object) => object.id === resolution.targetId)
        const element = elementByObjectId.current.get(resolution.targetId)
        if (element) {
          applyFeedback(resolution.targetId, "voice-target")
          applyFeedback(resolution.targetId, "voice-press")
          applyPrimitiveAction(element, resolution.primitiveAction, resolution.params)
          applyFeedback(resolution.targetId, "success")
          bumpVersion()
          return {
            ...baseResult,
            ok: true,
            executed: true,
            execution: "primitive-action",
            target,
          }
        }
      }

      applyFeedback(resolution.targetId, "error")
      return {
        ...baseResult,
        ok: false,
        executed: false,
        error: "Resolved interaction has no executable action.",
      }
    },
    [applyFeedback, bumpVersion]
  )

  const submitUtterance = React.useCallback(
    async (
      text: string,
      options: InteractionSubmitOptions = {}
    ): Promise<InteractionSubmitResult> => {
      const { snapshot: resolvedSnapshot, resolution } = await resolveText(text)

      if (resolution.status === "needs_clarification") {
        return {
          snapshot: resolvedSnapshot,
          resolution,
          ok: false,
          executed: false,
          error: resolution.reason ?? "The interaction needs clarification.",
        }
      }

      return dispatchResolution(resolution, {
        ...options,
        baseStateVersion: options.baseStateVersion ?? resolvedSnapshot.stateVersion,
      })
    },
    [dispatchResolution, resolveText]
  )

  const registerNode = React.useCallback(
    (node: RegisteredNode) => {
      setNodes((current) => new Map(current).set(node.id, node))
      bumpVersion()
      return () => {
        setNodes((current) => {
          const next = new Map(current)
          next.delete(node.id)
          return next
        })
        bumpVersion()
      }
    },
    [bumpVersion]
  )

  const registerGroup = React.useCallback(
    (group: RegisteredGroup) => {
      setGroups((current) => new Map(current).set(group.id, group))
      bumpVersion()
      return () => {
        setGroups((current) => {
          const next = new Map(current)
          next.delete(group.id)
          return next
        })
        bumpVersion()
      }
    },
    [bumpVersion]
  )

  const registerObject = React.useCallback(
    (object: RegisteredVirtualObject) => {
      setObjects((current) => new Map(current).set(object.id, object))
      bumpVersion()
      return () => {
        setObjects((current) => {
          const next = new Map(current)
          next.delete(object.id)
          return next
        })
        bumpVersion()
      }
    },
    [bumpVersion]
  )

  const registerManifest = React.useCallback(
    (id: string, nextManifest: AppInteractionManifest) => {
      setManifests((current) => new Map(current).set(id, nextManifest))
      bumpVersion()
      return () => {
        setManifests((current) => {
          const next = new Map(current)
          next.delete(id)
          return next
        })
        bumpVersion()
      }
    },
    [bumpVersion]
  )

  const registerPage = React.useCallback(
    (nextPage: RegisteredPage) => {
      setPage(nextPage)
      bumpVersion()
      return () => {
        setPage((current) => (current?.id === nextPage.id ? undefined : current))
        bumpVersion()
      }
    },
    [bumpVersion]
  )

  const registerActions = React.useCallback(
    (registration: ActionRegistration) => {
      setActions((current) => new Map(current).set(registration.namespace, registration))
      bumpVersion()
      return () => {
        setActions((current) => {
          const next = new Map(current)
          next.delete(registration.namespace)
          return next
        })
        bumpVersion()
      }
    },
    [bumpVersion]
  )

  const value = React.useMemo<RuntimeContextValue>(
    () => ({
      snapshot,
      lastResolution,
      getSnapshot,
      resolveText,
      dispatchResolution,
      submitUtterance,
      registerNode,
      registerGroup,
      registerObject,
      registerManifest,
      registerPage,
      registerActions,
    }),
    [
      dispatchResolution,
      getSnapshot,
      lastResolution,
      registerActions,
      registerGroup,
      registerNode,
      registerObject,
      registerManifest,
      registerPage,
      resolveText,
      snapshot,
      submitUtterance,
    ]
  )

  return (
    <RuntimeContext.Provider value={value}>
      <div ref={rootRef} data-mm-root="">
        {children}
      </div>
    </RuntimeContext.Provider>
  )
}

export function useMultimodalRuntime(): RuntimeContextValue {
  const context = React.useContext(RuntimeContext)
  if (!context) {
    throw new Error("Multimodal hooks must be used inside <MultimodalProvider>.")
  }
  return context
}

export type UseInteractionNodeOptions = {
  id?: string
  role: string
  label?: string
  labelFrom?: "text" | "aria" | "none"
  actions?: string[]
  state?: Record<string, unknown>
  hint?: InteractionHint
}

export function useInteractionNode<TElement extends HTMLElement>(
  options: UseInteractionNodeOptions
): React.RefCallback<TElement> {
  const { registerNode } = useMultimodalRuntime()
  const generatedId = React.useId().replace(/:/g, "")
  const id = options.id ?? `node.${generatedId}`
  const [element, setElement] = React.useState<TElement | null>(null)
  const optionSignature = stableStringify({
    id,
    role: options.role,
    label: options.label,
    labelFrom: options.labelFrom,
    actions: options.actions,
    hint: options.hint,
    state: options.state,
  })

  React.useEffect(() => {
    if (!element) return undefined
    // 中文：把语义也写到 data-* 上，自动 DOM 抽取和外部调试工具都能读取。
    // English: Writes semantics into data-* attributes so auto extraction and external debugging can read them.
    element.dataset.mmNodeId = id
    element.dataset.mmRole = options.role
    if (options.label) element.dataset.mmLabel = options.label
    if (options.hint?.aliases?.length) element.dataset.mmAliases = options.hint.aliases.join("|")

    return registerNode({
      id,
      role: options.role,
      label: options.label,
      labelFrom: options.labelFrom,
      actions: options.actions,
      hint: options.hint,
      state: options.state,
      element,
    })
  }, [
    element,
    id,
    optionSignature,
    registerNode,
  ])

  return React.useCallback((node: TElement | null) => setElement(node), [])
}

export type MultimodalPageProps = React.HTMLAttributes<HTMLDivElement> & {
  id: string
  title: string
  route?: string
  state?: Record<string, unknown>
}

export function MultimodalPage({ id, title, route, state, children, ...props }: MultimodalPageProps) {
  const { registerPage } = useMultimodalRuntime()
  const pageSignature = stableStringify({ id, title, route, state })

  React.useEffect(
    () => registerPage({ id, title, route, state }),
    [id, pageSignature, registerPage, route, title]
  )

  return (
    <div data-mm-page-id={id} data-mm-label={title} {...props}>
      {children}
    </div>
  )
}

export type MultimodalGroupProps = React.HTMLAttributes<HTMLDivElement> & {
  id: string
  role: string
  label?: string
  aliases?: string[]
  entity?: EntityRef
  state?: Record<string, unknown>
  indexBy?: "visible_order"
}

export function MultimodalGroup({
  id,
  role,
  label,
  aliases,
  entity,
  state,
  indexBy,
  children,
  ...props
}: MultimodalGroupProps) {
  const { registerGroup } = useMultimodalRuntime()
  const [element, setElement] = React.useState<HTMLDivElement | null>(null)
  const groupSignature = stableStringify({ id, role, label, aliases, entity, state, indexBy })

  React.useEffect(() => {
    if (!element) return undefined
    // 中文：Group 自身不会执行 DOM 操作，但会成为规则/LLM 可定位的语义目标。
    // English: A group does not execute DOM actions itself, but becomes a semantic target for rules and LLMs.
    element.dataset.mmGroupId = id
    element.dataset.mmRole = role
    if (label) element.dataset.mmLabel = label
    if (aliases?.length) element.dataset.mmAliases = aliases.join("|")

    return registerGroup({
      id,
      role,
      label,
      aliases,
      entity,
      state,
      indexBy,
      element,
    })
  }, [element, groupSignature, id, registerGroup, role, label, indexBy])

  return (
    <div ref={setElement} data-mm-group-root="" {...props}>
      {children}
    </div>
  )
}

export function useInteractionObject(object: InteractionObject): void {
  const { registerObject } = useMultimodalRuntime()
  const objectSignature = stableStringify(object)

  React.useEffect(
    () => registerObject(object),
    [object.id, objectSignature, registerObject]
  )
}

export function useInteractionObjects(objects: InteractionObject[]): void {
  const { registerObject } = useMultimodalRuntime()
  const objectsSignature = stableStringify(objects)

  React.useEffect(() => {
    const disposers = objects.map((object) => registerObject(object))
    return () => {
      disposers.forEach((dispose) => dispose())
    }
  }, [objectsSignature, registerObject])
}

export function useInteractionManifest(
  manifest: AppInteractionManifest,
  id = "app"
): void {
  const { registerManifest } = useMultimodalRuntime()
  const manifestSignature = stableStringify(manifest)

  React.useEffect(
    () => registerManifest(id, manifest),
    [id, manifestSignature, registerManifest]
  )
}

export type UseInteractionActionsOptions<TAction extends ActionPayload = ActionPayload> = {
  namespace: string
  actions: Record<string, DomainActionSpec<TAction>>
  execute?: ActionExecutor<TAction>
}

export function useInteractionActions<TAction extends ActionPayload = ActionPayload>(
  options: UseInteractionActionsOptions<TAction>
): void {
  const { registerActions } = useMultimodalRuntime()
  const executeRef = React.useRef(options.execute)
  executeRef.current = options.execute
  const stableExecute = React.useCallback<ActionExecutor>(
    // 中文：保持 executor 引用稳定，避免仅因闭包变化反复注册 action。
    // English: Keeps the executor reference stable so actions are not re-registered just because closures changed.
    (action, context) => executeRef.current?.(action as TAction, context),
    []
  )
  const actionSignature = stableStringify({
    namespace: options.namespace,
    actions: options.actions,
  })

  React.useEffect(
    () =>
      registerActions({
        namespace: options.namespace,
        actions: options.actions as Record<string, DomainActionSpec>,
        execute: options.execute ? stableExecute : undefined,
      }),
    [actionSignature, options.namespace, registerActions, stableExecute]
  )
}

export function useInteractionHint(hint: InteractionHint): Record<string, string> {
  return {
    ...(hint.aliases?.length ? { "data-mm-aliases": hint.aliases.join("|") } : {}),
    ...(hint.fallbackLabel ? { "data-mm-label": hint.fallbackLabel } : {}),
  }
}

export function useInteractionSnapshot(): InteractionSnapshot {
  return useMultimodalRuntime().snapshot
}

export function useLastResolution(): ResolvedInteraction | undefined {
  return useMultimodalRuntime().lastResolution
}

export function useInteractionApi(): InteractionApi {
  const {
    snapshot,
    lastResolution,
    getSnapshot,
    resolveText,
    dispatchResolution,
    submitUtterance,
  } = useMultimodalRuntime()

  return React.useMemo(
    () => ({
      snapshot,
      lastResolution,
      getSnapshot,
      resolveText,
      dispatchResolution,
      submitUtterance,
    }),
    [dispatchResolution, getSnapshot, lastResolution, resolveText, snapshot, submitUtterance]
  )
}

export function useSubmitUtterance(): (
  text: string,
  options?: InteractionSubmitOptions
) => Promise<InteractionSubmitResult> {
  return useMultimodalRuntime().submitUtterance
}

function resolveRegisteredNodeLabel(node: RegisteredNode): string | undefined {
  if (node.label) return node.label
  if (node.hint?.fallbackLabel) return node.hint.fallbackLabel
  if (node.labelFrom === "none") return undefined
  return getElementLabel(node.element)
}

function buildGroupObjects(
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

function isModalGroupActive(
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

function shouldObserveMutation(mutation: MutationRecord): boolean {
  if (isIgnoredRuntimeTarget(mutation.target)) return false

  if (mutation.type !== "childList") return true

  const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes]
  if (!changedNodes.length) return true

  return changedNodes.some((node) => !isIgnoredRuntimeTarget(node))
}

function isIgnoredRuntimeTarget(target: EventTarget | Node | null): boolean {
  if (!target) return false
  const node = target instanceof Node ? target : undefined
  const element =
    node instanceof Element
      ? node
      : node?.parentElement

  return Boolean(element?.closest("[data-mm-ignore='true']"))
}

async function resolveCandidate(
  utterance: string,
  snapshot: InteractionSnapshot,
  options: {
    localResolvers?: IntentResolver[]
    resolvers?: IntentResolver[]
    resolverMode: ResolverMode
  }
): Promise<ResolvedInteraction> {
  // 中文：解析策略支持 rule-only、rule-first 和 llm-first；默认先用本地规则，置信度不足再走外部 resolver。
  // English: Resolution supports rule-only, rule-first, and llm-first; the default tries local rules before external resolvers.
  if (options.resolverMode !== "llm-first" && options.localResolvers?.length) {
    const localResult = await resolveWithResolvers(
      { utterance, snapshot },
      options.localResolvers,
      0.8
    )

    if (localResult.status === "resolved" || localResult.status === "needs_clarification") {
      return localResult
    }
  }

  const ruleResult = resolveUtterance(utterance, snapshot)
  if (options.resolverMode === "rule-only" || !options.resolvers?.length) {
    return ruleResult
  }

  const compactSnapshot = compactSnapshotForIntent(snapshot)
  const externalResolvers = options.resolvers

  if (options.resolverMode === "llm-first") {
    return resolveWithResolvers(
      { utterance, snapshot: compactSnapshot },
      [...externalResolvers, ...(options.localResolvers ?? []), ruleResolver],
      0.7
    )
  }

  if (ruleResult.status === "resolved" && ruleResult.confidence >= 0.8) {
    return ruleResult
  }

  const resolverResult = await resolveWithResolvers(
    { utterance, snapshot: compactSnapshot },
    externalResolvers,
    0.7
  )

  if (resolverResult.status === "resolved" || resolverResult.status === "needs_clarification") {
    return resolverResult
  }

  return ruleResult
}

function stableStringify(value: unknown): string {
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
