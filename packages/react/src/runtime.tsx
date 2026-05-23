import {
  buildActionPayload,
  compactSnapshotForIntent,
  createInteractionSnapshot,
  resolveUtterance,
  resolveWithResolvers,
  ruleResolver,
  validateActionRequest,
  type ActionContext,
  type ActionExecutor,
  type ActionPayload,
  type DomainActionSpec,
  type EntityRef,
  type InteractionHint,
  type InteractionObject,
  type InteractionResolutionResult,
  type InteractionSnapshot,
  type InteractionSubmitOptions,
  type InteractionSubmitResult,
  type PageObject,
  type RegisteredActionSpec,
  type ResolverMode,
  type IntentResolver,
  type ResolvedInteraction,
} from "@multimodal-ui/core"
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
  registerPage: (page: RegisteredPage) => () => void
  registerActions: (registration: ActionRegistration) => () => void
}

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
  language?: string
  device?: string
  resolvers?: IntentResolver[]
  resolverMode?: ResolverMode
  onResolution?: (resolution: ResolvedInteraction) => void
  onClarification?: (resolution: ResolvedInteraction) => void
}

export function MultimodalProvider(props: MultimodalProviderProps) {
  const {
    children,
    device,
    language,
    onClarification,
    onResolution,
    resolverMode = "rule-first",
    resolvers,
  } = props
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const elementByObjectId = React.useRef(new Map<string, HTMLElement>())
  const snapshotRef = React.useRef<InteractionSnapshot>(emptySnapshot)
  const [version, setVersion] = React.useState(0)
  const [nodes, setNodes] = React.useState(() => new Map<string, RegisteredNode>())
  const [groups, setGroups] = React.useState(() => new Map<string, RegisteredGroup>())
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

  const snapshot = React.useMemo(() => {
    const elementMap = new Map<string, HTMLElement>()
    const root = rootRef.current
    const rawObjects: InteractionObject[] = []

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
      extractDomNodes(root).forEach(({ object, element }) => {
        elementMap.set(object.id, element)
        rawObjects.push(object)
      })
    }

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

    const builtSnapshot = createInteractionSnapshot({
      stateVersion: version,
      page: pageObject,
      contextStack: [...pageContext, ...modalContexts],
      visibleObjects: [...groupObjects, ...rawObjects],
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
  }, [actionSpecs, device, groups, language, nodes, page, version])

  const applyFeedback = React.useCallback((targetId: string, phase: string) => {
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
      const currentSnapshot = snapshotRef.current
      const resolution = await resolveCandidate(text, currentSnapshot, {
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
    [onClarification, onResolution, resolverMode, resolvers]
  )

  const dispatchResolution = React.useCallback(
    async (
      resolution: ResolvedInteraction,
      options: InteractionSubmitOptions = {}
    ): Promise<InteractionSubmitResult> => {
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

      applyFeedback(resolution.targetId, "voice-target")
      elementByObjectId.current
        .get(resolution.targetId)
        ?.ownerDocument.defaultView
        ?.setTimeout(() => applyFeedback(resolution.targetId!, "voice-press"), 80)

      if (resolution.actionId) {
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
        const target = currentSnapshot.visibleObjects.find((object) => object.id === resolution.targetId)
        const element = elementByObjectId.current.get(resolution.targetId)
        if (element) {
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
    element.getAttribute("role") === "combobox" ||
    element.getAttribute("role") === "slider"
  )
}

function isActionControl(element: HTMLElement): boolean {
  const role = element.dataset.mmRole ?? element.getAttribute("role")
  return element instanceof HTMLButtonElement || ["button", "switch", "checkbox", "tab", "option", "menuitem"].includes(role ?? "")
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
    resolvers?: IntentResolver[]
    resolverMode: ResolverMode
  }
): Promise<ResolvedInteraction> {
  const ruleResult = resolveUtterance(utterance, snapshot)
  if (options.resolverMode === "rule-only" || !options.resolvers?.length) {
    return ruleResult
  }

  const compactSnapshot = compactSnapshotForIntent(snapshot)
  const externalResolvers = options.resolvers

  if (options.resolverMode === "llm-first") {
    return resolveWithResolvers(
      { utterance, snapshot: compactSnapshot },
      [...externalResolvers, ruleResolver],
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
