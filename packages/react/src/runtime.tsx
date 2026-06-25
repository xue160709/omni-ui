import {
  buildActionPayload,
  buildBatchCommandEnvelope,
  buildCommandEnvelope,
  compactSnapshotForIntent,
  createSnapshotAnchor,
  createConfiguredRuleResolver,
  createInteractionSnapshot,
  createInteractionEventBuffer,
  createInteractionTrace,
  createConfirmationGrant,
  createInteractionTurn,
  dispatchCommand,
  dispatchBatchCommands,
  completeInteractionTrace,
  reduceFocusEvent,
  setSemanticFocus as setCoreSemanticFocus,
  deriveActiveContext,
  transitionTurn,
  mergeInteractionManifests,
  normalizeConfiguredRules,
  normalizePrimitiveActions,
  resolveUtterance,
  resolveWithResolvers,
  ruleResolver,
  validateActionRequest,
  type CommandEnvelope,
  type CommandSource,
  type ConfirmationGrant,
  type ActionExecutionResult,
  type ActionExecutor,
  type ActionPayload,
  type DispatchResult,
  type BatchDispatchResult,
  type InteractionTrace,
  type InteractionTurn,
  type InteractionEvent,
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
  type InteractionEventInput,
  type ResolvedInteraction,
  type UnifiedFocus,
  type VoiceInput,
} from "@omni-ui/core"
import * as React from "react"
import {
  extractDomNodes,
  getElementLabel,
  getElementState,
  hintToAliases,
  isElementVisible,
} from "./dom"
import {
  executeDomPrimitiveAction,
  inferDomPrimitiveActions,
} from "./primitive-executor"

type RegisteredNode = {
  id: string
  ownerId?: string
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
  ownerId?: string
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
  ownerId?: string
  title: string
  route?: string
  state?: Record<string, unknown>
}

type RegisteredVirtualObject = InteractionObject & {
  ownerId?: string
}

type ActionRegistration = {
  namespace: string
  ownerId?: string
  actions: Record<string, DomainActionSpec>
  execute?: ActionExecutor
}

type RuntimeContextValue = {
  snapshot: InteractionSnapshot
  lastResolution?: ResolvedInteraction
  getSnapshot: () => InteractionSnapshot
  getActiveTurn: () => InteractionTurn | undefined
  getTurn: (turnId: string) => InteractionTurn | undefined
  resolveVoice: (input: VoiceInput) => Promise<InteractionTurn>
  submitVoice: (input: VoiceInput) => Promise<InteractionTurn>
  confirmTurn: (turnId: string) => Promise<DispatchResult>
  cancelTurn: (turnId: string, reason?: string) => void
  resolveText: (text: string) => Promise<InteractionResolutionResult>
  dispatchResolution: (
    resolution: ResolvedInteraction,
    options?: InteractionSubmitOptions
  ) => Promise<InteractionSubmitResult>
  dispatchBatchResolutions: (
    resolutions: ResolvedInteraction[],
    options?: InteractionSubmitOptions
  ) => Promise<{ batch: BatchDispatchResult; results: InteractionSubmitResult[] }>
  submitUtterance: (text: string, options?: InteractionSubmitOptions) => Promise<InteractionSubmitResult>
  recordEvent: (event: InteractionEventInput) => void
  setSemanticFocus: (objectId: string, options?: { ttlMs?: number; confidence?: number }) => void
  invalidateSnapshot: (reason?: string) => void
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
  | "snapshot"
  | "lastResolution"
  | "getSnapshot"
  | "getActiveTurn"
  | "getTurn"
  | "resolveVoice"
  | "submitVoice"
  | "confirmTurn"
  | "cancelTurn"
  | "resolveText"
  | "dispatchResolution"
  | "dispatchBatchResolutions"
  | "submitUtterance"
  | "recordEvent"
  | "setSemanticFocus"
  | "invalidateSnapshot"
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
  onTurnChange?: (turn: InteractionTurn) => void
  onInteractionEvent?: (event: InteractionEvent) => void
  onTrace?: (trace: InteractionTrace) => void
  onRegistryError?: (error: Error) => void
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
    onInteractionEvent,
    onResolution,
    onRegistryError,
    onTrace,
    onTurnChange,
    resolverMode = "rule-first",
    resolvers,
  } = props
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  // 中文：objectId 到 DOM 的映射只存在本地，用于 primitive 执行和反馈动画，不进入 snapshot。
  // English: objectId-to-DOM mapping stays local for primitive execution and feedback animation; it is not serialized into snapshots.
  const elementByObjectId = React.useRef(new Map<string, HTMLElement>())
  const snapshotRef = React.useRef<InteractionSnapshot>(emptySnapshot)
  const eventBufferRef = React.useRef(createInteractionEventBuffer())
  const resolverAbortRef = React.useRef<AbortController | undefined>(undefined)
  const partialVoiceTurnIdsRef = React.useRef(new Map<string, string>())
  const partialVoiceAbortRef = React.useRef(new Map<string, AbortController>())
  const commandCounter = React.useRef(0)
  const turnCounter = React.useRef(0)
  const explicitInvalidationVersionsRef = React.useRef<number[]>([])
  const turnsRef = React.useRef(new Map<string, InteractionTurn>())
  const activeTurnIdRef = React.useRef<string | undefined>(undefined)
  const [version, setVersion] = React.useState(0)
  const [eventSequence, setEventSequence] = React.useState(0)
  const [, setTurnVersion] = React.useState(0)
  const [unifiedFocus, setUnifiedFocus] = React.useState<UnifiedFocus>(() => emptySnapshot.unifiedFocus)
  const [nodes, setNodes] = React.useState(() => new Map<string, RegisteredNode>())
  const [groups, setGroups] = React.useState(() => new Map<string, RegisteredGroup>())
  const [objects, setObjects] = React.useState(() => new Map<string, RegisteredVirtualObject>())
  const [manifests, setManifests] = React.useState(() => new Map<string, AppInteractionManifest>())
  const [page, setPage] = React.useState<RegisteredPage | undefined>()
  const [actions, setActions] = React.useState(() => new Map<string, ActionRegistration>())
  const [lastResolution, setLastResolution] = React.useState<ResolvedInteraction | undefined>()
  const lastResolutionRef = React.useRef<ResolvedInteraction | undefined>(undefined)

  const bumpVersion = React.useCallback((reason?: string) => {
    setVersion((current) => {
      const next = current + 1
      if (reason) {
        explicitInvalidationVersionsRef.current = [
          ...explicitInvalidationVersionsRef.current,
          next,
        ].slice(-20)
      }
      return next
    })
  }, [])
  const invalidateSnapshot = React.useCallback(
    (reason = "manual invalidation") => bumpVersion(reason),
    [bumpVersion]
  )
  const publishTurn = React.useCallback(
    (turn: InteractionTurn, options: { active?: boolean } = {}) => {
      turnsRef.current.set(turn.id, turn)
      if (options.active ?? !isTerminalTurnStatus(turn.status)) {
        activeTurnIdRef.current = turn.id
      }
      setTurnVersion((current) => current + 1)
      onTurnChange?.(turn)
    },
    [onTurnChange]
  )
  const getActiveTurn = React.useCallback(
    () => (activeTurnIdRef.current ? turnsRef.current.get(activeTurnIdRef.current) : undefined),
    []
  )
  const getTurn = React.useCallback((turnId: string) => turnsRef.current.get(turnId), [])

  const recordEvent = React.useCallback(
    (event: InteractionEventInput) => {
      const snapshot = snapshotRef.current
      eventBufferRef.current.append({
        ...event,
        snapshotId: event.snapshotId ?? snapshot.snapshotId,
        baseStateVersion: event.baseStateVersion ?? snapshot.stateVersion,
      })
      setEventSequence(eventBufferRef.current.sequence)
      const latest = eventBufferRef.current.recent(1)[0]
      if (latest) {
        onInteractionEvent?.(latest)
        setUnifiedFocus((current) =>
          reduceFocusEvent(current, latest, snapshotRef.current)
        )
      }
    },
    [onInteractionEvent]
  )

  const setSemanticFocus = React.useCallback(
    (objectId: string, options: { ttlMs?: number; confidence?: number } = {}) => {
      setUnifiedFocus((current) =>
        setCoreSemanticFocus(current, objectId, {
          source: "programmatic",
          ttlMs: options.ttlMs,
          confidence: options.confidence,
        })
      )
      bumpVersion()
    },
    [bumpVersion]
  )

  React.useEffect(() => {
    bumpVersion()
  }, [bumpVersion])

  React.useEffect(() => {
    const root = rootRef.current
    if (!root) return

    let queuedRuntimeBump = false
    const scheduleRuntimeBump = () => {
      if (queuedRuntimeBump) return
      queuedRuntimeBump = true
      const view = root.ownerDocument.defaultView
      if (!view) {
        queuedRuntimeBump = false
        bumpVersion()
        return
      }
      const run = () => {
        queuedRuntimeBump = false
        bumpVersion()
      }
      if (typeof view.queueMicrotask === "function") {
        view.queueMicrotask(run)
      } else {
        Promise.resolve().then(run)
      }
    }

    // 中文：DOM 变化和表单事件都会推动 stateVersion 递增，确保执行前能发现快照过期。
    // English: DOM mutations and form events bump stateVersion so dispatch can detect stale snapshots before executing.
    const observer = new MutationObserver((mutations) => {
      if (mutations.some(shouldObserveMutation)) scheduleRuntimeBump()
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
        "aria-valuenow",
        "aria-valuetext",
        "aria-readonly",
        "aria-required",
        "aria-invalid",
        "aria-current",
        "aria-activedescendant",
        "disabled",
        "hidden",
        "value",
        "checked",
        "selected",
        "readonly",
        "required",
        "inert",
        "role",
        "tabindex",
        "open",
        "data-state",
        "data-mm-label",
        "data-mm-role",
      ],
    })

    const handleRuntimeEvent = (event: Event) => {
      if (isIgnoredRuntimeTarget(event.target)) return
      const targetId = findObjectIdForDomTarget(event.target, elementByObjectId.current)
      recordEvent({
        modality: "gui",
        type: event.type === "focusin"
          ? "gui.focus.changed"
          : event.type === "input" || event.type === "change"
            ? "gui.input.changed"
            : "gui.navigation.changed",
        target: targetId,
        value: event.type === "input" || event.type === "change"
          ? readInputEventValue(event.target)
          : undefined,
      })
      if (event.type === "input" || event.type === "change") {
        scheduleRuntimeBump()
      }
    }

    const handlePointerEvent = (event: Event) => {
      if (isIgnoredRuntimeTarget(event.target)) return
      const targetId = findObjectIdForDomTarget(event.target, elementByObjectId.current)
      if (targetId) {
        recordEvent({
          modality: "gui",
          type: "gui.pointer.activated",
          target: targetId,
        })
      }
    }

    root.addEventListener("click", handlePointerEvent)
    root.addEventListener("focusin", handleRuntimeEvent)
    root.addEventListener("focusout", handleRuntimeEvent)
    root.addEventListener("input", handleRuntimeEvent)
    root.addEventListener("change", handleRuntimeEvent)

    return () => {
      observer.disconnect()
      root.removeEventListener("click", handlePointerEvent)
      root.removeEventListener("focusin", handleRuntimeEvent)
      root.removeEventListener("focusout", handleRuntimeEvent)
      root.removeEventListener("input", handleRuntimeEvent)
      root.removeEventListener("change", handleRuntimeEvent)
    }
  }, [bumpVersion, recordEvent])

  const actionSpecs = React.useMemo(() => {
    // 中文：namespace 只用于组织和 manifest 元数据，真正执行时仍以 action id 查找 spec。
    // English: namespace is organizational metadata; dispatch still looks up specs by action id.
    const specs: Record<string, RegisteredActionSpec> = {}
    const owners = new Map<string, string | undefined>()
    actions.forEach((registration) => {
      Object.entries(registration.actions).forEach(([id, spec]) => {
        if (specs[id] && owners.get(id) !== registration.ownerId) {
          onRegistryError?.(
            new Error(
              `Duplicate multimodal action registration for ${id}: namespace ${registration.namespace} attempted to replace an existing action.`
            )
          )
          return
        }
        specs[id] = {
          ...spec,
          id,
          namespace: registration.namespace,
          execute: spec.execute ?? registration.execute,
        }
        owners.set(id, registration.ownerId)
      })
    })
    return specs
  }, [actions, onRegistryError])

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
        primitiveActions: normalizePrimitiveActions(
          node.actions ?? inferDomPrimitiveActions(node.role, node.element)
        ),
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
    const contextStack = [...pageContext, ...modalContexts]
    const snapshotFocus: UnifiedFocus = {
      ...unifiedFocus,
      activeContext: deriveActiveContext(contextStack),
    }
    const builtSnapshot = createInteractionSnapshot({
      stateVersion: version,
      manifest: effectiveManifest,
      page: pageObject,
      contextStack,
      visibleObjects: [...virtualObjects, ...groupObjects, ...rawObjects],
      unifiedFocus: snapshotFocus,
      focusRevision: snapshotFocus.revision,
      eventSequence,
      recentEvents: eventBufferRef.current.list(),
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
  }, [actionSpecs, device, effectiveManifest, eventSequence, groups, language, nodes, objects, page, unifiedFocus, version])

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
      const activeTurn = activeTurnIdRef.current
        ? turnsRef.current.get(activeTurnIdRef.current)
        : undefined
      const clarificationResolution = resolveClarificationAnswer(
        text,
        activeTurn,
        lastResolutionRef.current,
        currentSnapshot
      )
      if (clarificationResolution && activeTurn) {
        resolverAbortRef.current?.abort()
        const resolvingTurn = transitionTurn(activeTurn, {
          type: "transition",
          status: "resolving",
        })
        publishTurn(resolvingTurn)
        const resolution = stampResolutionProvenance(clarificationResolution, currentSnapshot, {
          turnId: activeTurn.id,
          modality: "text",
          anchor: activeTurn.anchor,
        })
        const resolvedTurn = transitionTurn(resolvingTurn, {
          type: "transition",
          status: "ready",
        })
        publishTurn(resolvedTurn)
        onTrace?.(completeInteractionTrace(createInteractionTrace(resolvedTurn), {}))
        lastResolutionRef.current = resolution
        setLastResolution(resolution)
        onResolution?.(resolution)
        return {
          snapshot: currentSnapshot,
          resolution,
        }
      }
      resolverAbortRef.current?.abort()
      const abortController = new AbortController()
      resolverAbortRef.current = abortController
      const turnId = `turn_${++turnCounter.current}`
      const createdTurn = createInteractionTurn({
        id: turnId,
        source: "text",
        input: {
          kind: "text",
          text,
          receivedAt: Date.now(),
        },
        anchor: createSnapshotAnchor(currentSnapshot),
      })
      const resolvingTurn = transitionTurn(createdTurn, {
        type: "transition",
        status: "resolving",
      })
      publishTurn(resolvingTurn)
      const resolved = await resolveCandidate(text, currentSnapshot, {
        localResolvers,
        resolvers,
        resolverMode,
        signal: abortController.signal,
        turnId,
      })
      if (abortController.signal.aborted || resolverAbortRef.current !== abortController) {
        publishTurn(
          transitionTurn(resolvingTurn, {
            type: "transition",
            status: "superseded",
          }),
          { active: false }
        )
        return {
          snapshot: currentSnapshot,
          resolution: {
            status: "unsupported",
            utterance: text,
            confidence: 0,
            reason: "解析请求已被新的输入取代",
          },
        }
      }
      const resolution = stampResolutionProvenance(resolved, currentSnapshot, {
        turnId,
        modality: "text",
      })
      const nextTurnStatus =
        resolution.status === "resolved"
          ? "ready"
          : resolution.status === "needs_clarification"
            ? "needs_clarification"
            : "rejected"
      const resolvedTurn = transitionTurn(resolvingTurn, {
        type: "transition",
        status: nextTurnStatus,
        clarification:
          nextTurnStatus === "needs_clarification"
            ? {
                id: `clarification_${turnId}`,
                prompt: resolution.reason ?? "需要进一步澄清",
                createdAt: Date.now(),
              }
            : undefined,
        error:
          nextTurnStatus === "rejected"
            ? {
                code: resolution.status,
                message: resolution.reason ?? "No interaction target was resolved.",
              }
            : undefined,
      })
      publishTurn(resolvedTurn)
      onTrace?.(completeInteractionTrace(createInteractionTrace(resolvedTurn), {}))
      lastResolutionRef.current = resolution
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
    [localResolvers, onClarification, onResolution, onTrace, publishTurn, resolverMode, resolvers]
  )

  const resolveVoice = React.useCallback(
    async (input: VoiceInput): Promise<InteractionTurn> => {
      recordEvent({
        modality: "voice",
        type: input.kind === "partial" ? "voice.asr.partial" : "voice.asr.final",
        text: input.text,
        confidence: input.confidence,
        timestamp: input.receivedAt,
      })

      const currentSnapshot = snapshotRef.current
      if (input.kind === "final") {
        const activeTurn = activeTurnIdRef.current
          ? turnsRef.current.get(activeTurnIdRef.current)
          : undefined
        const clarificationResolution = resolveClarificationAnswer(
          input.text,
          activeTurn,
          lastResolutionRef.current,
          currentSnapshot
        )
        if (clarificationResolution && activeTurn) {
          if (input.sessionId) {
            const sessionKey = voiceSessionKey(input)
            partialVoiceAbortRef.current.get(sessionKey)?.abort()
            partialVoiceAbortRef.current.delete(sessionKey)
            partialVoiceTurnIdsRef.current.delete(sessionKey)
          }
          resolverAbortRef.current?.abort()
          const resolvingTurn = transitionTurn(activeTurn, {
            type: "transition",
            status: "resolving",
          })
          publishTurn(resolvingTurn)
          const resolution = stampResolutionProvenance(clarificationResolution, currentSnapshot, {
            turnId: activeTurn.id,
            modality: "voice",
            anchor: activeTurn.anchor,
          })
          const resolvedTurn = transitionTurn(resolvingTurn, {
            type: "transition",
            status: "ready",
          })
          publishTurn(resolvedTurn)
          lastResolutionRef.current = resolution
          setLastResolution(resolution)
          onResolution?.(resolution)
          onTrace?.(completeInteractionTrace(createInteractionTrace(resolvedTurn), {}))
          return resolvedTurn
        }
      }
      const partialSessionKey =
        input.kind === "partial" ? voiceSessionKey(input) : undefined
      const turnId =
        partialSessionKey
          ? getPartialVoiceTurnId(
              partialSessionKey,
              partialVoiceTurnIdsRef.current,
              () => `partial_${++turnCounter.current}`
            )
          : `turn_${++turnCounter.current}`
      const createdTurn = createInteractionTurn({
        id: turnId,
        source: "voice",
        input,
        anchor: createSnapshotAnchor(currentSnapshot),
        now: input.receivedAt,
      })

      if (input.kind === "partial") {
        const previewAbortController = new AbortController()
        if (partialSessionKey) {
          partialVoiceAbortRef.current.get(partialSessionKey)?.abort()
          partialVoiceAbortRef.current.set(partialSessionKey, previewAbortController)
        }
        const preview = await resolvePartialVoicePreview(input, currentSnapshot, {
          localResolvers,
          signal: previewAbortController.signal,
          turnId,
        })
        if (previewAbortController.signal.aborted) {
          const superseded = transitionTurn(createdTurn, {
            type: "transition",
            status: "superseded",
          })
          publishTurn(superseded, { active: false })
          return superseded
        }
        const previewTurn = createPartialVoicePreviewTurn(
          createdTurn,
          stampResolutionProvenance(preview, currentSnapshot, {
            turnId,
            modality: "voice",
          }),
          turnsRef.current.get(turnId)
        )
        publishTurn(previewTurn, { active: false })
        if (preview.status === "resolved" && preview.targetId) {
          applyFeedback(preview.targetId, "voice-target")
        }
        return previewTurn
      }

      if (input.sessionId) {
        const sessionKey = voiceSessionKey(input)
        partialVoiceAbortRef.current.get(sessionKey)?.abort()
        partialVoiceAbortRef.current.delete(sessionKey)
        partialVoiceTurnIdsRef.current.delete(sessionKey)
      }

      resolverAbortRef.current?.abort()
      const abortController = new AbortController()
      resolverAbortRef.current = abortController
      const resolvingTurn = transitionTurn(createdTurn, {
        type: "transition",
        status: "resolving",
      })
      publishTurn(resolvingTurn)

      const resolved = await resolveVoiceCandidate(input, currentSnapshot, {
        localResolvers,
        resolvers,
        resolverMode,
        signal: abortController.signal,
        turnId,
      })

      if (abortController.signal.aborted || resolverAbortRef.current !== abortController) {
        const superseded = transitionTurn(resolvingTurn, {
          type: "transition",
          status: "superseded",
        })
        publishTurn(superseded, { active: false })
        return superseded
      }

      const resolution = stampResolutionProvenance(resolved, currentSnapshot, {
        turnId,
        modality: "voice",
      })
      const nextTurnStatus =
        resolution.status === "resolved"
          ? "ready"
          : resolution.status === "needs_clarification"
            ? "needs_clarification"
            : "rejected"
      const resolvedTurn = transitionTurn(resolvingTurn, {
        type: "transition",
        status: nextTurnStatus,
        clarification:
          nextTurnStatus === "needs_clarification"
            ? {
                id: `clarification_${turnId}`,
                prompt: resolution.reason ?? "需要进一步澄清",
                createdAt: Date.now(),
              }
            : undefined,
        error:
          nextTurnStatus === "rejected"
            ? {
                code: resolution.status,
                message: resolution.reason ?? "No interaction target was resolved.",
              }
            : undefined,
      })
      publishTurn(resolvedTurn)
      lastResolutionRef.current = resolution
      setLastResolution(resolution)
      onResolution?.(resolution)
      if (resolution.status === "needs_clarification") onClarification?.(resolution)
      onTrace?.(completeInteractionTrace(createInteractionTrace(resolvedTurn), {}))
      return resolvedTurn
    },
    [
      localResolvers,
      onClarification,
      onResolution,
      onTrace,
      applyFeedback,
      publishTurn,
      recordEvent,
      resolverMode,
      resolvers,
    ]
  )

  const cancelTurn = React.useCallback(
    (turnId: string, reason = "cancelled") => {
      const turn = turnsRef.current.get(turnId)
      if (!turn || isTerminalTurnStatus(turn.status)) return

      try {
        publishTurn(
          transitionTurn(turn, {
            type: "transition",
            status: "cancelled",
            error: {
              code: "cancelled",
              message: reason,
            },
          }),
          { active: false }
        )
      } catch {
        // Ignore cancellation for states that can no longer transition.
      }
    },
    [publishTurn]
  )

  const publishDispatchResultTurn = React.useCallback(
    (turnId: string, result: DispatchResult) => {
      const turn = turnsRef.current.get(turnId)
      if (!turn || isTerminalTurnStatus(turn.status)) return

      try {
        let next = turn
        if (next.status === "awaiting_confirmation") {
          next = transitionTurn(next, {
            type: "transition",
            status: "ready",
          })
        }
        if (next.status === "ready") {
          next = transitionTurn(next, {
            type: "transition",
            status: "validating",
          })
        }
        if (result.status === "rejected") {
          next = transitionTurn(next, {
            type: "transition",
            status: "rejected",
            result,
            error: dispatchRuntimeError(result),
          })
        } else {
          if (next.status === "validating") {
            next = transitionTurn(next, {
              type: "transition",
              status: "executing",
            })
          }
          if (result.status === "failed") {
            next = transitionTurn(next, {
              type: "transition",
              status: "failed",
              result,
              error: dispatchRuntimeError(result),
            })
          } else {
            if (next.status === "executing") {
              next = transitionTurn(next, {
                type: "transition",
                status: "verifying",
              })
            }
            next = transitionTurn(next, {
              type: "transition",
              status: turnStatusForDispatchResult(result),
              result,
              error: result.ok ? undefined : dispatchRuntimeError(result),
            })
          }
        }
        publishTurn(next, { active: false })
        onTrace?.(
          completeInteractionTrace(createInteractionTrace(next), {
            status: result.status,
          })
        )
      } catch {
        // Keep dispatch results available to callers even if a legacy turn state cannot transition.
      }
    },
    [onTrace, publishTurn]
  )

  const publishPendingConfirmationTurn = React.useCallback(
    (turnId: string, command: CommandEnvelope, result: DispatchResult) => {
      const turn = turnsRef.current.get(turnId)
      if (!turn || isTerminalTurnStatus(turn.status)) return

      try {
        const next = transitionTurn(turn, {
          type: "transition",
          status: "awaiting_confirmation",
          pendingCommand: command,
          result,
        })
        publishTurn(next)
      } catch {
        publishTurn({
          ...turn,
          revision: turn.revision + 1,
          status: "awaiting_confirmation",
          pendingCommand: command,
          result,
          updatedAt: Date.now(),
        })
      }
    },
    [publishTurn]
  )

  const ensureTurnForResolution = React.useCallback(
    (
      resolution: ResolvedInteraction,
      provenance: ResolutionProvenance
    ) => {
      if (turnsRef.current.has(provenance.turnId)) return

      const created = createInteractionTurn({
        id: provenance.turnId,
        source: provenance.source.modality,
        input: {
          kind: "text",
          text: resolution.utterance,
          receivedAt: provenance.resolvedAt,
        },
        anchor: provenance.anchor,
        now: provenance.resolvedAt,
      })
      const resolving = transitionTurn(created, {
        type: "transition",
        status: "resolving",
      })
      const ready = transitionTurn(resolving, {
        type: "transition",
        status: resolution.status === "resolved" ? "ready" : "rejected",
        error:
          resolution.status === "resolved"
            ? undefined
            : {
                code: resolution.status,
                message: resolution.reason ?? "No interaction target was resolved.",
              },
      })
      publishTurn({
        ...ready,
        anchor: provenance.anchor,
      })
      onTrace?.(completeInteractionTrace(createInteractionTrace(ready), {}))
    },
    [onTrace, publishTurn]
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
        const provenance = resolveDispatchProvenance(resolution, currentSnapshot, options)
        if (!provenance) {
          const validation = {
            ok: false as const,
            code: "missing_anchor" as const,
            reason: "缺少原始 Snapshot anchor",
          }
          applyFeedback(resolution.targetId, "error")
          return {
            ...baseResult,
            ok: false,
            executed: false,
            validation,
            error: validation.reason,
          }
        }
        ensureTurnForResolution(resolution, provenance)

        // 中文：旧 payload 映射先保留，随后把结果放入 CommandEnvelope 交给 core Dispatcher。
        // English: Legacy payload mapping stays as a wrapper, then enters the core Dispatcher as a CommandEnvelope.
        const legacyValidation = validateActionRequest(currentSnapshot, {
          actionId: resolution.actionId,
          targetId: resolution.targetId,
          baseStateVersion: provenance.anchor.stateVersion,
          confirmedActionId: resolution.actionId,
          candidate: resolution,
          utterance: resolution.utterance,
        })

        if (!legacyValidation.ok) {
          applyFeedback(resolution.targetId, "error")
          return {
            ...baseResult,
            ok: false,
            executed: false,
            validation: legacyValidation,
            error: legacyValidation.reason,
          }
        }

        const action = buildActionPayload(currentSnapshot, {
          actionId: resolution.actionId,
          targetId: resolution.targetId,
          baseStateVersion: provenance.anchor.stateVersion,
          confirmedActionId: options.confirmedActionId,
          candidate: resolution,
          utterance: resolution.utterance,
        })
        const target = currentSnapshot.visibleObjects.find((object) => object.id === resolution.targetId)
        const command = buildCommandEnvelope({
          commandId: `command_${++commandCounter.current}`,
          turnId: provenance.turnId,
          kind: "domain",
          actionId: resolution.actionId,
          source: provenance.source,
          targetId: resolution.targetId,
          params: stripActionType(action),
          anchor: provenance.anchor,
        })

        try {
          applyFeedback(resolution.targetId, "voice-target")
          applyFeedback(resolution.targetId, "voice-press")
          const dispatchSnapshot = options.forceConfirmation
            ? withForcedDomainConfirmation(currentSnapshot, resolution.actionId)
            : currentSnapshot
          const dispatchResult = await dispatchCommand(dispatchSnapshot, command, {
            candidate: resolution,
            utterance: resolution.utterance,
            confirmation: createLegacyConfirmationGrant(command, options.confirmedActionId),
            getSnapshot,
          })
          if (
            dispatchResult.validation &&
            !dispatchResult.validation.ok &&
            dispatchResult.validation.code === "confirmation_required"
          ) {
            publishPendingConfirmationTurn(provenance.turnId, command, dispatchResult)
          } else {
            publishDispatchResultTurn(provenance.turnId, dispatchResult)
          }
          if (!dispatchResult.ok) {
            applyFeedback(resolution.targetId, "error")
            return toInteractionSubmitResult({
              baseResult,
              dispatchResult,
              pendingCommand:
                dispatchResult.validation &&
                !dispatchResult.validation.ok &&
                dispatchResult.validation.code === "confirmation_required"
                  ? command
                  : undefined,
              execution: "domain-action",
              target,
              action,
            })
          }
          applyFeedback(resolution.targetId, "success")
          bumpVersion()
          return toInteractionSubmitResult({
            baseResult,
            dispatchResult,
            pendingCommand: undefined,
            execution: "domain-action",
            target,
            action,
          })
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
        const provenance = resolveDispatchProvenance(resolution, currentSnapshot, options)
        if (!provenance) {
          const validation = {
            ok: false as const,
            code: "missing_anchor" as const,
            reason: "缺少原始 Snapshot anchor",
          }
          applyFeedback(resolution.targetId, "error")
          return {
            ...baseResult,
            ok: false,
            executed: false,
            validation,
            error: validation.reason,
          }
        }
        ensureTurnForResolution(resolution, provenance)

        // 中文：primitive 也先构建 CommandEnvelope，再走 core Dispatcher 的统一校验链。
        // English: Primitive actions also build a CommandEnvelope and pass through the core Dispatcher chain.
        const target = currentSnapshot.visibleObjects.find((object) => object.id === resolution.targetId)
        const command = buildCommandEnvelope({
          commandId: `command_${++commandCounter.current}`,
          turnId: provenance.turnId,
          kind: "primitive",
          primitiveAction: resolution.primitiveAction,
          source: provenance.source,
          targetId: resolution.targetId,
          params: resolution.params,
          anchor: provenance.anchor,
        })

        applyFeedback(resolution.targetId, "voice-target")
        applyFeedback(resolution.targetId, "voice-press")
        const dispatchResult = await dispatchCommand(currentSnapshot, command, {
          executePrimitive: (primitiveCommand): ActionExecutionResult => {
            const element = elementByObjectId.current.get(primitiveCommand.targetId)
            if (!element) {
              return {
                status: "rejected",
                reason: "No DOM element is registered for the primitive target.",
                code: "missing_element",
              }
            }
            return executeDomPrimitiveAction(element, primitiveCommand.primitiveAction, primitiveCommand.params)
          },
        })
        publishDispatchResultTurn(provenance.turnId, dispatchResult)

        if (dispatchResult.ok) {
          applyFeedback(resolution.targetId, "success")
          bumpVersion()
        } else {
          applyFeedback(resolution.targetId, "error")
        }

        return toInteractionSubmitResult({
          baseResult,
          dispatchResult,
          pendingCommand: undefined,
          execution: "primitive-action",
          target,
        })
      }

      applyFeedback(resolution.targetId, "error")
      return {
        ...baseResult,
        ok: false,
        executed: false,
        error: "Resolved interaction has no executable action.",
      }
    },
    [
      applyFeedback,
      bumpVersion,
      ensureTurnForResolution,
      getSnapshot,
      publishDispatchResultTurn,
      publishPendingConfirmationTurn,
    ]
  )

  const dispatchBatchResolutions = React.useCallback(
    async (
      resolutions: ResolvedInteraction[],
      options: InteractionSubmitOptions = {}
    ): Promise<{ batch: BatchDispatchResult; results: InteractionSubmitResult[] }> => {
      const currentSnapshot = snapshotRef.current
      const entries: Array<{
        resolution: ResolvedInteraction
        command: CommandEnvelope
        target?: InteractionObject
        action?: ActionPayload
        execution: NonNullable<InteractionSubmitResult["execution"]>
      }> = []
      const buildFailures: InteractionSubmitResult[] = []

      for (const resolution of resolutions) {
        const baseResult = { snapshot: currentSnapshot, resolution }
        if (resolution.status !== "resolved" || !resolution.targetId) {
          buildFailures.push({
            ...baseResult,
            ok: false,
            executed: false,
            error: resolution.reason ?? "No resolved interaction target.",
          })
          continue
        }

        const provenance = resolveDispatchProvenance(resolution, currentSnapshot, options)
        if (!provenance) {
          const validation = {
            ok: false as const,
            code: "missing_anchor" as const,
            reason: "缺少原始 Snapshot anchor",
          }
          buildFailures.push({
            ...baseResult,
            ok: false,
            executed: false,
            validation,
            error: validation.reason,
          })
          continue
        }
        ensureTurnForResolution(resolution, provenance)

        if (resolution.actionId) {
          const action = buildActionPayload(currentSnapshot, {
            actionId: resolution.actionId,
            targetId: resolution.targetId,
            baseStateVersion: provenance.anchor.stateVersion,
            confirmedActionId: resolution.actionId,
            candidate: resolution,
            utterance: resolution.utterance,
          })
          const command = buildCommandEnvelope({
            commandId: `command_${++commandCounter.current}`,
            turnId: provenance.turnId,
            kind: "domain",
            actionId: resolution.actionId,
            source: provenance.source,
            targetId: resolution.targetId,
            params: stripActionType(action),
            anchor: provenance.anchor,
          })
          entries.push({
            resolution,
            command,
            target: currentSnapshot.visibleObjects.find((object) => object.id === resolution.targetId),
            action,
            execution: "domain-action",
          })
          continue
        }

        if (resolution.primitiveAction) {
          const command = buildCommandEnvelope({
            commandId: `command_${++commandCounter.current}`,
            turnId: provenance.turnId,
            kind: "primitive",
            primitiveAction: resolution.primitiveAction,
            source: provenance.source,
            targetId: resolution.targetId,
            params: resolution.params,
            anchor: provenance.anchor,
          })
          entries.push({
            resolution,
            command,
            target: currentSnapshot.visibleObjects.find((object) => object.id === resolution.targetId),
            execution: "primitive-action",
          })
          continue
        }

        buildFailures.push({
          ...baseResult,
          ok: false,
          executed: false,
          error: "Resolved interaction has no executable action.",
        })
      }

      if (buildFailures.length > 0) {
        return {
          batch: {
            ok: false,
            status: "rejected",
            batchId: `batch_${++commandCounter.current}`,
            turnId: entries[0]?.command.turnId ?? "batch_rejected",
            items: buildFailures
              .map((result) => result.dispatch)
              .filter((result): result is DispatchResult => Boolean(result)),
          },
          results: buildFailures,
        }
      }

      const commands = entries.map((entry) => entry.command)
      const batch = buildBatchCommandEnvelope({
        batchId: `batch_${++commandCounter.current}`,
        turnId: commands[0]?.turnId ?? `batch_turn_${Date.now()}`,
        mode: options.batchMode ?? "best_effort",
        commands,
      })
      const dispatchSnapshot = options.forceConfirmation
        ? commands.reduce(
            (nextSnapshot, command) =>
              command.kind === "domain"
                ? withForcedDomainConfirmation(nextSnapshot, command.actionId)
                : nextSnapshot,
            currentSnapshot
          )
        : currentSnapshot
      const batchResult = await dispatchBatchCommands(dispatchSnapshot, batch, {
        transaction: options.batchTransaction,
        getSnapshot,
        executePrimitive: (primitiveCommand): ActionExecutionResult => {
          const element = elementByObjectId.current.get(primitiveCommand.targetId)
          if (!element) {
            return {
              status: "rejected",
              reason: "No DOM element is registered for the primitive target.",
              code: "missing_element",
            }
          }
          return executeDomPrimitiveAction(
            element,
            primitiveCommand.primitiveAction,
            primitiveCommand.params
          )
        },
      })
      const entriesWithReturnedItems =
        batchResult.status === "rejected" && batchResult.items.length < entries.length
          ? entries.filter((entry) =>
              batchResult.items.some((item) => item.commandId === entry.command.commandId)
            )
          : entries
      const results = entriesWithReturnedItems.map((entry) => {
        const dispatchResult =
          batchResult.items.find((item) => item.commandId === entry.command.commandId) ??
          ({
            ok: false,
            status: "failed",
            commandId: entry.command.commandId,
            turnId: entry.command.turnId,
            targetId: entry.command.targetId,
            actionId: entry.command.kind === "domain" ? entry.command.actionId : undefined,
            primitiveAction:
              entry.command.kind === "primitive" ? entry.command.primitiveAction : undefined,
            error: {
              code: "execution_failed",
              message: "Batch dispatcher did not return an item result.",
            },
          } satisfies DispatchResult)
        publishDispatchResultTurn(entry.command.turnId, dispatchResult)
        if (dispatchResult.ok) applyFeedback(entry.command.targetId, "success")
        else applyFeedback(entry.command.targetId, "error")
        return toInteractionSubmitResult({
          baseResult: {
            snapshot: currentSnapshot,
            resolution: entry.resolution,
          },
          dispatchResult,
          execution: entry.execution,
          target: entry.target,
          action: entry.action,
        })
      })

      if (results.some((result) => result.ok)) bumpVersion()

      return {
        batch: batchResult,
        results,
      }
    },
    [applyFeedback, bumpVersion, ensureTurnForResolution, getSnapshot, publishDispatchResultTurn]
  )

  const confirmTurn = React.useCallback(
    async (turnId: string): Promise<DispatchResult> => {
      const turn = turnsRef.current.get(turnId)
      const command = turn?.pendingCommand

      if (!turn || !command || turn.status !== "awaiting_confirmation") {
        return {
          ok: false,
          status: "rejected",
          commandId: command?.commandId ?? `missing_command_${turnId}`,
          turnId,
          error: {
            code: "turn_inactive",
            message: "No pending command is awaiting confirmation for this turn.",
          },
        }
      }

      const currentSnapshot = snapshotRef.current
      const confirmation = createConfirmationGrant(command, {
        confirmedBy: "text",
      })

      try {
        publishTurn(
          transitionTurn(turn, {
            type: "transition",
            status: "ready",
            confirmation,
          })
        )
      } catch {
        // The dispatcher remains the source of truth; transition failures should not reparse or mutate the command.
      }

      applyFeedback(command.targetId, "voice-target")
      applyFeedback(command.targetId, "voice-press")
      let dispatchResult = await dispatchCommand(currentSnapshot, command, {
        confirmation,
        getSnapshot,
        executePrimitive:
          command.kind === "primitive"
            ? (primitiveCommand): ActionExecutionResult => {
                const element = elementByObjectId.current.get(primitiveCommand.targetId)
                if (!element) {
                  return {
                    status: "rejected",
                    reason: "No DOM element is registered for the primitive target.",
                    code: "missing_element",
                  }
                }
                return executeDomPrimitiveAction(
                  element,
                  primitiveCommand.primitiveAction,
                  primitiveCommand.params
                )
              }
            : undefined,
      })
      if (
        shouldRetryConfirmedCommandAfterIrrelevantStateDrift(
          dispatchResult,
          currentSnapshot,
          command,
          explicitInvalidationVersionsRef.current
        )
      ) {
        dispatchResult = await dispatchCommand(
          {
            ...currentSnapshot,
            stateVersion: command.anchor.stateVersion,
          },
          command,
          {
            confirmation,
            getSnapshot,
            executePrimitive:
              command.kind === "primitive"
                ? (primitiveCommand): ActionExecutionResult => {
                    const element = elementByObjectId.current.get(primitiveCommand.targetId)
                    if (!element) {
                      return {
                        status: "rejected",
                        reason: "No DOM element is registered for the primitive target.",
                        code: "missing_element",
                      }
                    }
                    return executeDomPrimitiveAction(
                      element,
                      primitiveCommand.primitiveAction,
                      primitiveCommand.params
                    )
                  }
                : undefined,
          }
        )
      }

      if (dispatchResult.ok) {
        applyFeedback(command.targetId, "success")
        bumpVersion()
      } else {
        applyFeedback(command.targetId, "error")
      }
      publishDispatchResultTurn(turnId, dispatchResult)
      return dispatchResult
    },
    [applyFeedback, bumpVersion, getSnapshot, publishDispatchResultTurn, publishTurn]
  )

  const submitVoice = React.useCallback(
    async (input: VoiceInput): Promise<InteractionTurn> => {
      const turn = await resolveVoice(input)
      if (input.kind !== "final" || turn.status !== "ready") return turn

      const resolution = lastResolutionRef.current
      if (!resolution?.provenance || resolution.provenance.turnId !== turn.id) return turn

      await dispatchResolution(resolution)
      return turnsRef.current.get(turn.id) ?? turn
    },
    [dispatchResolution, resolveVoice]
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
      setNodes((current) => {
        if (!canAcceptRegistration(current.get(node.id), node, `node:${node.id}`, onRegistryError)) {
          return current
        }
        return new Map(current).set(node.id, node)
      })
      bumpVersion()
      return () => {
        setNodes((current) => {
          if (!isRegistrationOwner(current.get(node.id), node)) return current
          const next = new Map(current)
          next.delete(node.id)
          return next
        })
        bumpVersion()
      }
    },
    [bumpVersion, onRegistryError]
  )

  const registerGroup = React.useCallback(
    (group: RegisteredGroup) => {
      setGroups((current) => {
        if (!canAcceptRegistration(current.get(group.id), group, `group:${group.id}`, onRegistryError)) {
          return current
        }
        return new Map(current).set(group.id, group)
      })
      bumpVersion()
      return () => {
        setGroups((current) => {
          if (!isRegistrationOwner(current.get(group.id), group)) return current
          const next = new Map(current)
          next.delete(group.id)
          return next
        })
        bumpVersion()
      }
    },
    [bumpVersion, onRegistryError]
  )

  const registerObject = React.useCallback(
    (object: RegisteredVirtualObject) => {
      setObjects((current) => {
        if (!canAcceptRegistration(current.get(object.id), object, `object:${object.id}`, onRegistryError)) {
          return current
        }
        return new Map(current).set(object.id, object)
      })
      bumpVersion()
      return () => {
        setObjects((current) => {
          if (!isRegistrationOwner(current.get(object.id), object)) return current
          const next = new Map(current)
          next.delete(object.id)
          return next
        })
        bumpVersion()
      }
    },
    [bumpVersion, onRegistryError]
  )

  const registerManifest = React.useCallback(
    (id: string, nextManifest: AppInteractionManifest) => {
      setManifests((current) => new Map(current).set(id, nextManifest))
      bumpVersion()
      return () => {
        setManifests((current) => {
          if (current.get(id) !== nextManifest) return current
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
      setPage((current) =>
        canAcceptRegistration(current, nextPage, `page:${nextPage.id}`, onRegistryError)
          ? nextPage
          : current
      )
      bumpVersion()
      return () => {
        setPage((current) => (isRegistrationOwner(current, nextPage) ? undefined : current))
        bumpVersion()
      }
    },
    [bumpVersion, onRegistryError]
  )

  const registerActions = React.useCallback(
    (registration: ActionRegistration) => {
      setActions((current) => {
        if (
          !canAcceptRegistration(
            current.get(registration.namespace),
            registration,
            `actions:${registration.namespace}`,
            onRegistryError
          )
        ) {
          return current
        }
        return new Map(current).set(registration.namespace, registration)
      })
      bumpVersion()
      return () => {
        setActions((current) => {
          if (!isRegistrationOwner(current.get(registration.namespace), registration)) return current
          const next = new Map(current)
          next.delete(registration.namespace)
          return next
        })
        bumpVersion()
      }
    },
    [bumpVersion, onRegistryError]
  )

  const value = React.useMemo<RuntimeContextValue>(
    () => ({
      snapshot,
      lastResolution,
      getSnapshot,
      getActiveTurn,
      getTurn,
      resolveVoice,
      submitVoice,
      confirmTurn,
      cancelTurn,
      resolveText,
      dispatchResolution,
      dispatchBatchResolutions,
      submitUtterance,
      recordEvent,
      setSemanticFocus,
      invalidateSnapshot,
      registerNode,
      registerGroup,
      registerObject,
      registerManifest,
      registerPage,
      registerActions,
    }),
    [
      dispatchResolution,
      dispatchBatchResolutions,
      getSnapshot,
      getActiveTurn,
      getTurn,
      resolveVoice,
      submitVoice,
      confirmTurn,
      cancelTurn,
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
      recordEvent,
      setSemanticFocus,
      invalidateSnapshot,
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
  const ownerIdRef = React.useRef(createRuntimeOwnerId("node"))
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
      ownerId: ownerIdRef.current,
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
  const ownerIdRef = React.useRef(createRuntimeOwnerId("page"))
  const pageSignature = stableStringify({ id, title, route, state })

  React.useLayoutEffect(
    () => registerPage({ id, ownerId: ownerIdRef.current, title, route, state }),
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
  const ownerIdRef = React.useRef(createRuntimeOwnerId("group"))
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
      ownerId: ownerIdRef.current,
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
  const ownerIdRef = React.useRef(createRuntimeOwnerId("object"))
  const objectSignature = stableStringify(object)

  React.useEffect(
    () => registerObject({ ...object, ownerId: ownerIdRef.current }),
    [object.id, objectSignature, registerObject]
  )
}

export function useInteractionObjects(objects: InteractionObject[]): void {
  const { registerObject } = useMultimodalRuntime()
  const ownerIdRef = React.useRef(createRuntimeOwnerId("objects"))
  const objectsSignature = stableStringify(objects)

  React.useEffect(() => {
    const disposers = objects.map((object) =>
      registerObject({ ...object, ownerId: `${ownerIdRef.current}:${object.id}` })
    )
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
  const ownerIdRef = React.useRef(createRuntimeOwnerId("actions"))
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
        ownerId: ownerIdRef.current,
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
    getActiveTurn,
    getTurn,
    resolveVoice,
    submitVoice,
    confirmTurn,
    cancelTurn,
    resolveText,
    dispatchResolution,
    dispatchBatchResolutions,
    submitUtterance,
    recordEvent,
    setSemanticFocus,
    invalidateSnapshot,
  } = useMultimodalRuntime()

  return React.useMemo(
    () => ({
      snapshot,
      lastResolution,
      getSnapshot,
      getActiveTurn,
      getTurn,
      resolveVoice,
      submitVoice,
      confirmTurn,
      cancelTurn,
      resolveText,
      dispatchResolution,
      dispatchBatchResolutions,
      submitUtterance,
      recordEvent,
      setSemanticFocus,
      invalidateSnapshot,
    }),
    [
      dispatchResolution,
      dispatchBatchResolutions,
      getSnapshot,
      getActiveTurn,
      getTurn,
      resolveVoice,
      submitVoice,
      confirmTurn,
      cancelTurn,
      invalidateSnapshot,
      lastResolution,
      recordEvent,
      resolveText,
      setSemanticFocus,
      snapshot,
      submitUtterance,
    ]
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

function findObjectIdForDomTarget(
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

function readInputEventValue(target: EventTarget | null): Record<string, unknown> | undefined {
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

type ResolutionProvenance = NonNullable<ResolvedInteraction["provenance"]>

function stampResolutionProvenance(
  resolution: ResolvedInteraction,
  snapshot: InteractionSnapshot,
  options: {
    turnId: string
    modality: CommandSource["modality"]
    anchor?: ResolutionProvenance["anchor"]
  }
): ResolvedInteraction {
  const resolverIds = [resolution.resolverId].filter((id): id is string => Boolean(id))
  return {
    ...resolution,
    provenance: {
      turnId: options.turnId,
      anchor: options.anchor ?? createSnapshotAnchor(snapshot),
      source: {
        modality: options.modality,
        resolverIds,
        modelGenerated: resolverIds.some(isModelResolverId),
      },
      resolvedAt: Date.now(),
    },
  }
}

function resolveDispatchProvenance(
  resolution: ResolvedInteraction,
  snapshot: InteractionSnapshot,
  options: InteractionSubmitOptions
): ResolutionProvenance | undefined {
  if (resolution.provenance) return resolution.provenance
  if (typeof options.baseStateVersion !== "number") return undefined

  const resolverIds = [resolution.resolverId ?? "legacy"].filter(Boolean)
  const modelGenerated = resolverIds.some(isModelResolverId)
  return {
    turnId: `legacy_${options.baseStateVersion}_${resolution.targetId ?? "unknown"}`,
    anchor: {
      ...createSnapshotAnchor(snapshot),
      stateVersion: options.baseStateVersion,
    },
    source: {
      modality: modelGenerated ? "assistant" : "text",
      resolverIds,
      modelGenerated,
    },
    resolvedAt: Date.now(),
  }
}

function createLegacyConfirmationGrant(
  command: CommandEnvelope,
  confirmedActionId: string | undefined
): ConfirmationGrant | undefined {
  if (command.kind !== "domain" || confirmedActionId !== command.actionId) return undefined

  return createConfirmationGrant(command, {
    confirmedBy: "text",
  })
}

function stripActionType(action: ActionPayload): Record<string, unknown> {
  const { type: _type, ...params } = action
  return params
}

function toInteractionSubmitResult(input: {
  baseResult: InteractionResolutionResult
  dispatchResult: DispatchResult
  pendingCommand?: CommandEnvelope
  execution: NonNullable<InteractionSubmitResult["execution"]>
  target?: InteractionObject
  action?: ActionPayload
}): InteractionSubmitResult {
  const { baseResult, dispatchResult, pendingCommand, execution, target, action } = input
  const executed = dispatchResult.ok && dispatchResult.status !== "rejected" && dispatchResult.status !== "failed"
  const validation = dispatchResult.validation
  const error =
    dispatchResult.error?.message ??
    (validation && !validation.ok ? validation.reason : undefined)

  return {
    ...baseResult,
    ok: dispatchResult.ok,
    executed,
    pendingCommand,
    dispatch: dispatchResult,
    execution: executed ? execution : undefined,
    target,
    action,
    validation,
    error,
  }
}

function isTerminalTurnStatus(status: InteractionTurn["status"]): boolean {
  return [
    "committed",
    "unverified",
    "noop",
    "rejected",
    "failed",
    "cancelled",
    "superseded",
    "expired",
  ].includes(status)
}

function turnStatusForDispatchResult(result: DispatchResult): InteractionTurn["status"] {
  if (result.status === "committed") return "committed"
  if (result.status === "noop") return "noop"
  if (result.status === "unverified" || result.status === "pending") return "unverified"
  if (result.status === "failed") return "failed"
  return "rejected"
}

function dispatchRuntimeError(result: DispatchResult) {
  return {
    code:
      result.error?.code ??
      (result.validation && !result.validation.ok ? result.validation.code : undefined) ??
      result.status,
    message:
      result.error?.message ??
      (result.validation && !result.validation.ok ? result.validation.reason : undefined) ??
      result.status,
  }
}

function resolveClarificationAnswer(
  answer: string,
  activeTurn: InteractionTurn | undefined,
  pendingResolution: ResolvedInteraction | undefined,
  snapshot: InteractionSnapshot
): ResolvedInteraction | undefined {
  if (activeTurn?.status !== "needs_clarification") return undefined
  if (pendingResolution?.status !== "needs_clarification") return undefined
  const targetCandidates = pendingResolution.targetCandidates ?? []
  if (!targetCandidates.length) return undefined

  const targetId =
    targetCandidates[parseClarificationOrdinal(answer) - 1]?.id ??
    findClarificationCandidateByLabel(answer, targetCandidates, snapshot)
  if (!targetId) return undefined

  const target = snapshot.visibleObjects.find((object) => object.id === targetId)
  if (!target) return undefined
  const action = chooseClarifiedAction(target, pendingResolution.intent)
  if (!action) return undefined
  const candidate = targetCandidates.find((item) => item.id === targetId)

  return {
    status: "resolved",
    utterance: pendingResolution.utterance,
    intent: pendingResolution.intent,
    targetId,
    ...action,
    params: pendingResolution.params,
    confidence: Math.max(pendingResolution.confidence, candidate?.confidence ?? 0),
    reason: `clarification:${answer.trim()}`,
    resolverId: pendingResolution.resolverId ?? "clarification",
  }
}

function parseClarificationOrdinal(answer: string): number {
  const text = answer.trim()
  const digit = text.match(/第?\s*(\d+)\s*(个|项|条|行)?/)
  if (digit) return Number(digit[1])
  const words: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
  }
  const word = text.match(/第?\s*([一二两三四五])\s*(个|项|条|行)?/)
  return word ? words[word[1]] ?? 0 : 0
}

function findClarificationCandidateByLabel(
  answer: string,
  candidates: Array<{ id: string }>,
  snapshot: InteractionSnapshot
): string | undefined {
  const query = normalizeClarificationText(answer)
  if (!query) return undefined
  return candidates.find((candidate) => {
    const object = snapshot.visibleObjects.find((item) => item.id === candidate.id)
    if (!object) return false
    return [object.label, ...(object.aliases ?? [])]
      .filter((value): value is string => typeof value === "string")
      .some((value) => {
        const label = normalizeClarificationText(value)
        return label === query || label.includes(query) || query.includes(label)
      })
  })?.id
}

function chooseClarifiedAction(
  target: InteractionObject,
  intent: string | undefined
): Pick<ResolvedInteraction, "actionId" | "primitiveAction"> | undefined {
  const actions = target.actions ?? []
  const primitives = target.primitiveActions ?? []
  const domain = (suffixes: string[]) =>
    actions.find((action) =>
      suffixes.some((suffix) =>
        suffix.startsWith(".")
          ? action.endsWith(suffix)
          : action === suffix || action.endsWith(`.${suffix}`)
      )
    )
  const primitive = (candidates: NonNullable<ResolvedInteraction["primitiveAction"]>[]) =>
    primitives.find((action) => candidates.includes(action))

  if (intent === "complete") {
    const actionId = domain([".complete", "complete"])
    if (actionId) return { actionId }
    const primitiveAction = primitive(["check", "toggle"])
    if (primitiveAction) return { primitiveAction }
  }
  if (intent === "delete") {
    const actionId = domain([".delete", "delete"])
    if (actionId) return { actionId }
  }
  if (intent === "open" || intent === "navigate") {
    const actionId = domain([".open", ".goto", ".navigate", "open", "goto", "navigate"])
    if (actionId) return { actionId }
    const primitiveAction = primitive(["press", "open"])
    if (primitiveAction) return { primitiveAction }
  }
  if (intent === "select") {
    const actionId = domain([".filter", ".select", ".goto", ".navigate", "goto", "navigate"])
    if (actionId) return { actionId }
    const primitiveAction = primitive(["press", "selectByLabel", "selectByIndex"])
    if (primitiveAction) return { primitiveAction }
  }

  const actionId = actions[0]
  if (actionId) return { actionId }
  const primitiveAction = primitives[0]
  return primitiveAction ? { primitiveAction } : undefined
}

function normalizeClarificationText(value: string): string {
  return value.toLowerCase().replace(/[，。！？、,.!?:：；;\s"'“”‘’]/g, "")
}

function withForcedDomainConfirmation(
  snapshot: InteractionSnapshot,
  actionId: string
): InteractionSnapshot {
  const spec = snapshot.actionSpecs[actionId]
  if (!spec) return snapshot

  return {
    ...snapshot,
    actionSpecs: {
      ...snapshot.actionSpecs,
      [actionId]: {
        ...spec,
        confirmation: {
          ...spec.confirmation,
          required: true,
        },
      },
    },
  }
}

function shouldRetryConfirmedCommandAfterIrrelevantStateDrift(
  result: DispatchResult,
  snapshot: InteractionSnapshot,
  command: CommandEnvelope,
  explicitInvalidationVersions: number[]
): boolean {
  if (!result.validation || result.validation.ok || result.validation.code !== "state_changed") {
    return false
  }
  if (command.anchor.contextHash !== snapshot.contextHash) return false
  if (command.anchor.focusRevision !== snapshot.focusRevision) return false
  if (!snapshot.visibleObjects.some((object) => object.id === command.targetId)) return false

  return !explicitInvalidationVersions.some(
    (version) => version > command.anchor.stateVersion && version <= snapshot.stateVersion
  )
}

function isModelResolverId(id: string): boolean {
  return /llm|model|openai|anthropic|assistant/i.test(id)
}

function canAcceptRegistration<T extends { ownerId?: string }>(
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

function isRegistrationOwner<T extends { ownerId?: string }>(
  current: T | undefined,
  candidate: T
): boolean {
  if (!current) return false
  if (current === candidate) return true
  if (!current.ownerId || !candidate.ownerId) return current === candidate
  return current.ownerId === candidate.ownerId
}

let runtimeOwnerCounter = 0

function createRuntimeOwnerId(prefix: string): string {
  runtimeOwnerCounter += 1
  return `${prefix}_${runtimeOwnerCounter}`
}

async function resolveCandidate(
  utterance: string,
  snapshot: InteractionSnapshot,
  options: {
    localResolvers?: IntentResolver[]
    resolvers?: IntentResolver[]
    resolverMode: ResolverMode
    signal?: AbortSignal
    turnId?: string
    voiceInput?: VoiceInput
    recentEvents?: InteractionEvent[]
  }
): Promise<ResolvedInteraction> {
  // 中文：解析策略支持 rule-only、rule-first 和 llm-first；默认先用本地规则，置信度不足再走外部 resolver。
  // English: Resolution supports rule-only, rule-first, and llm-first; the default tries local rules before external resolvers.
  if (options.resolverMode !== "llm-first" && options.localResolvers?.length) {
    const localResult = await resolveWithResolvers(
      {
        utterance,
        snapshot,
        signal: options.signal,
        turnId: options.turnId,
        voiceInput: options.voiceInput,
        recentEvents: options.recentEvents,
      },
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
      {
        utterance,
        snapshot: compactSnapshot,
        signal: options.signal,
        turnId: options.turnId,
        voiceInput: options.voiceInput,
        recentEvents: options.recentEvents,
      },
      [...externalResolvers, ...(options.localResolvers ?? []), ruleResolver],
      0.7
    )
  }

  if (ruleResult.status === "resolved" && ruleResult.confidence >= 0.8) {
    return ruleResult
  }

  const resolverResult = await resolveWithResolvers(
    {
      utterance,
      snapshot: compactSnapshot,
      signal: options.signal,
      turnId: options.turnId,
      voiceInput: options.voiceInput,
      recentEvents: options.recentEvents,
    },
    externalResolvers,
    0.7
  )

  if (resolverResult.status === "resolved" || resolverResult.status === "needs_clarification") {
    return resolverResult
  }

  return ruleResult
}

async function resolveVoiceCandidate(
  input: VoiceInput,
  snapshot: InteractionSnapshot,
  options: {
    localResolvers?: IntentResolver[]
    resolvers?: IntentResolver[]
    resolverMode: ResolverMode
    signal?: AbortSignal
    turnId?: string
  }
): Promise<ResolvedInteraction> {
  const alternatives = getVoiceAlternatives(input)
  let primaryResult: ResolvedInteraction | undefined
  let bestResolved:
    | {
        resolution: ResolvedInteraction
        score: number
        transcript: string
      }
    | undefined
  let bestClarification: ResolvedInteraction | undefined

  for (const alternative of alternatives) {
    if (options.signal?.aborted) {
      return {
        status: "unsupported",
        utterance: input.text,
        confidence: 0,
        reason: "Resolver request was aborted.",
      }
    }

    const resolution = await resolveCandidate(alternative.text, snapshot, {
      ...options,
      voiceInput: {
        ...input,
        text: alternative.text,
        confidence: alternative.confidence ?? input.confidence,
      },
      recentEvents: snapshot.recentEvents,
    })
    if (!primaryResult) primaryResult = resolution

    const asrConfidence = alternative.confidence ?? input.confidence ?? 1
    const score = resolution.confidence * asrConfidence
    if (resolution.status === "resolved" && (!bestResolved || score > bestResolved.score)) {
      bestResolved = {
        resolution,
        score,
        transcript: alternative.text,
      }
    }

    if (resolution.status === "needs_clarification" && !bestClarification) {
      bestClarification = resolution
    }
  }

  if (bestResolved) {
    return {
      ...bestResolved.resolution,
      utterance: input.text,
      confidence: Math.min(1, bestResolved.score),
      reason:
        bestResolved.transcript === input.text
          ? bestResolved.resolution.reason
          : [
              bestResolved.resolution.reason,
              `asr_alternative:${bestResolved.transcript}`,
            ]
              .filter(Boolean)
              .join(";"),
    }
  }

  return bestClarification ?? primaryResult ?? {
    status: "not_found",
    utterance: input.text,
    confidence: 0,
    reason: "没有 resolver 能识别该语音表达",
  }
}

async function resolvePartialVoicePreview(
  input: VoiceInput,
  snapshot: InteractionSnapshot,
  options: {
    localResolvers?: IntentResolver[]
    signal?: AbortSignal
    turnId?: string
  }
): Promise<ResolvedInteraction> {
  return resolveCandidate(input.text, snapshot, {
    localResolvers: options.localResolvers,
    resolverMode: "rule-only",
    signal: options.signal,
    turnId: options.turnId,
    voiceInput: input,
    recentEvents: snapshot.recentEvents,
  })
}

function createPartialVoicePreviewTurn(
  createdTurn: InteractionTurn,
  resolution: ResolvedInteraction,
  previousTurn?: InteractionTurn
): InteractionTurn {
  const resolving = transitionTurn(createdTurn, {
    type: "transition",
    status: "resolving",
    at: createdTurn.updatedAt,
  })
  const status =
    resolution.status === "resolved"
      ? "ready"
      : resolution.status === "needs_clarification"
        ? "needs_clarification"
        : "rejected"
  const next = transitionTurn(resolving, {
    type: "transition",
    status,
    at: createdTurn.updatedAt,
    candidates: previewCandidatesFromResolution(resolution),
    decision:
      resolution.status === "resolved" && resolution.targetId
        ? {
            targetId: resolution.targetId,
            actionId: resolution.actionId,
            primitiveAction: resolution.primitiveAction,
            params: resolution.params ?? {},
            score: resolution.confidence,
            confidenceMargin: resolution.confidence,
            evidence: [],
          }
        : undefined,
    clarification:
      status === "needs_clarification"
        ? {
            id: `clarification_${createdTurn.id}`,
            prompt: resolution.reason ?? "需要进一步澄清",
            createdAt: createdTurn.updatedAt,
          }
        : undefined,
    error:
      status === "rejected"
        ? {
            code: resolution.status,
            message: resolution.reason ?? "Partial voice preview did not resolve.",
          }
        : undefined,
  })

  return {
    ...next,
    revision: (previousTurn?.revision ?? 0) + 1,
  }
}

function previewCandidatesFromResolution(
  resolution: ResolvedInteraction
): InteractionTurn["candidates"] {
  const candidates = resolution.targetCandidates?.length
    ? resolution.targetCandidates.map((candidate) => ({
        targetId: candidate.id,
        score: candidate.confidence,
      }))
    : resolution.targetId
      ? [{ targetId: resolution.targetId, score: resolution.confidence }]
      : []

  return candidates.map((candidate, index) => ({
    id: `preview_${resolution.provenance?.turnId ?? "turn"}_${index + 1}`,
    hypothesisId: resolution.resolverId ?? "preview",
    targetId: candidate.targetId,
    actionId: resolution.actionId,
    primitiveAction: resolution.primitiveAction,
    params: resolution.params ?? {},
    score: candidate.score,
    evidence: [],
  }))
}

function getPartialVoiceTurnId(
  sessionKey: string,
  sessions: Map<string, string>,
  createId: () => string
): string {
  const existing = sessions.get(sessionKey)
  if (existing) return existing
  const next = createId()
  sessions.set(sessionKey, next)
  return next
}

function voiceSessionKey(input: VoiceInput): string {
  return input.sessionId ? `session:${input.sessionId}` : `partial:${input.startedAt ?? input.receivedAt}`
}

function getVoiceAlternatives(input: VoiceInput): Array<{ text: string; confidence?: number }> {
  const seen = new Set<string>()
  return [
    { text: input.text, confidence: input.confidence },
    ...(input.nBest ?? []),
  ]
    .map((alternative) => ({
      text: alternative.text.trim(),
      confidence: alternative.confidence,
    }))
    .filter((alternative) => {
      if (!alternative.text || seen.has(alternative.text)) return false
      seen.add(alternative.text)
      return true
    })
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
