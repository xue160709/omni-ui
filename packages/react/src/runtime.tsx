import {
  buildActionPayload,
  createInteractionSnapshot,
  resolveUtterance,
  validateActionRequest,
  type ActionContext,
  type ActionExecutor,
  type ActionPayload,
  type DomainActionSpec,
  type EntityRef,
  type InteractionHint,
  type InteractionObject,
  type InteractionSnapshot,
  type PageObject,
  type RegisteredActionSpec,
} from "@multimodal-ui/core"
import * as React from "react"
import {
  applyPrimitiveAction,
  extractDomNodes,
  getElementLabel,
  getElementState,
  hintToAliases,
  inferPrimitiveActions,
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
  submitUtterance: (text: string) => Promise<void>
  registerNode: (node: RegisteredNode) => () => void
  registerGroup: (group: RegisteredGroup) => () => void
  registerPage: (page: RegisteredPage) => () => void
  registerActions: (registration: ActionRegistration) => () => void
}

const emptySnapshot: InteractionSnapshot = createInteractionSnapshot({
  stateVersion: 0,
  visibleObjects: [],
})

const RuntimeContext = React.createContext<RuntimeContextValue | null>(null)

export type MultimodalProviderProps = {
  children: React.ReactNode
  language?: string
  device?: string
}

export function MultimodalProvider(props: MultimodalProviderProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const elementByObjectId = React.useRef(new Map<string, HTMLElement>())
  const snapshotRef = React.useRef<InteractionSnapshot>(emptySnapshot)
  const [version, setVersion] = React.useState(0)
  const [nodes, setNodes] = React.useState(() => new Map<string, RegisteredNode>())
  const [groups, setGroups] = React.useState(() => new Map<string, RegisteredGroup>())
  const [page, setPage] = React.useState<RegisteredPage | undefined>()
  const [actions, setActions] = React.useState(() => new Map<string, ActionRegistration>())

  const bumpVersion = React.useCallback(() => setVersion((current) => current + 1), [])

  React.useEffect(() => {
    bumpVersion()
  }, [bumpVersion])

  React.useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const observer = new MutationObserver(() => bumpVersion())
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "aria-label",
        "aria-checked",
        "aria-selected",
        "aria-disabled",
        "disabled",
        "data-mm-label",
        "data-mm-role",
      ],
    })

    root.addEventListener("focusin", bumpVersion)
    root.addEventListener("focusout", bumpVersion)
    root.addEventListener("input", bumpVersion)
    root.addEventListener("change", bumpVersion)

    return () => {
      observer.disconnect()
      root.removeEventListener("focusin", bumpVersion)
      root.removeEventListener("focusout", bumpVersion)
      root.removeEventListener("input", bumpVersion)
      root.removeEventListener("change", bumpVersion)
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

    const builtSnapshot = createInteractionSnapshot({
      stateVersion: version,
      page: pageObject,
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
        language: props.language ?? "zh-CN",
        device: props.device ?? "desktop",
      },
    })

    elementByObjectId.current = elementMap
    snapshotRef.current = builtSnapshot
    return builtSnapshot
  }, [actionSpecs, groups, nodes, page, props.device, props.language, version])

  const applyFeedback = React.useCallback((targetId: string, phase: string) => {
    const element = elementByObjectId.current.get(targetId)
    if (!element) return

    element.dataset.mmFeedback = phase
    window.setTimeout(() => {
      if (element.dataset.mmFeedback === phase) {
        delete element.dataset.mmFeedback
      }
    }, phase === "voice-target" ? 380 : 520)
  }, [])

  const submitUtterance = React.useCallback(
    async (text: string) => {
      const currentSnapshot = snapshotRef.current
      const candidate = resolveUtterance(text, currentSnapshot)
      if (candidate.status !== "resolved" || !candidate.targetId) {
        return
      }

      applyFeedback(candidate.targetId, "voice-target")
      window.setTimeout(() => applyFeedback(candidate.targetId!, "voice-press"), 80)

      if (candidate.actionId) {
        const validation = validateActionRequest(currentSnapshot, {
          actionId: candidate.actionId,
          targetId: candidate.targetId,
          baseStateVersion: currentSnapshot.stateVersion,
          candidate,
          utterance: text,
        })

        if (!validation.ok) {
          applyFeedback(candidate.targetId, "error")
          return
        }

        const action = buildActionPayload(currentSnapshot, {
          actionId: candidate.actionId,
          targetId: candidate.targetId,
          baseStateVersion: currentSnapshot.stateVersion,
          candidate,
          utterance: text,
        })
        const spec = currentSnapshot.actionSpecs[candidate.actionId]
        const target = currentSnapshot.visibleObjects.find((object) => object.id === candidate.targetId)

        if (spec?.execute && target) {
          await spec.execute(action as ActionPayload, {
            actionId: candidate.actionId,
            target,
            snapshot: currentSnapshot,
            candidate,
            utterance: text,
          } satisfies ActionContext)
          applyFeedback(candidate.targetId, "success")
          bumpVersion()
        }
        return
      }

      if (candidate.primitiveAction) {
        const element = elementByObjectId.current.get(candidate.targetId)
        if (element) {
          applyPrimitiveAction(element, candidate.primitiveAction, candidate.params)
          applyFeedback(candidate.targetId, "success")
          bumpVersion()
        }
      }
    },
    [applyFeedback, bumpVersion]
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
      submitUtterance,
      registerNode,
      registerGroup,
      registerPage,
      registerActions,
    }),
    [registerActions, registerGroup, registerNode, registerPage, snapshot, submitUtterance]
  )

  return (
    <RuntimeContext.Provider value={value}>
      <div ref={rootRef} data-mm-root="">
        {props.children}
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

export function useSubmitUtterance(): (text: string) => Promise<void> {
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

  return Array.from(groups.values()).map((group) => {
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
      ? Array.from(groups.values()).filter(
          (candidate) =>
            candidate.role === group.role &&
            candidate.id !== parentList.id &&
            parentList.element.contains(candidate.element)
        )
      : []
    const index = parentList?.indexBy === "visible_order" ? siblings.findIndex((item) => item.id === group.id) + 1 : undefined
    const inferredState = inferGroupState(group, children, elementMap)
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

  return state
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
