import {
  buildActionPayload,
  buildBatchCommandEnvelope,
  buildCommandEnvelope,
  buildCommandFromTurnDecision,
  CommandConflictLock,
  createSnapshotAnchor,
  createConfiguredRuleResolver,
  createInteractionSnapshot,
  createInteractionEventBuffer,
  createInteractionTrace,
  createConfirmationGrant,
  createInteractionTurn,
  createInteractionTurnStore,
  adaptLegacyIntentResolver,
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
  resolveInteractionTurn,
  validateActionRequest,
  type CommandEnvelope,
  type CommandSource,
  type ConfirmationGrant,
  type DispatchPhaseEvent,
  type ActionContext,
  type ActionExecutionResult,
  type ActionDefinition,
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
  getElementState,
  hintToAliases,
  isElementVisible,
} from "./dom"
import {
  executeDomPrimitiveAction,
  inferDomPrimitiveActions,
} from "./primitive-executor"
import {
  canAcceptConfirmedCommandAfterIrrelevantStateDrift,
  createLegacyConfirmationGrant,
  createMissingProvenanceValidation,
  dispatchLifecycleEventType,
  dispatchLifecycleEventValue,
  dispatchLifecycleTargetId,
  dispatchRuntimeError,
  focusSourceFromCommandSource,
  isOmniError,
  isTerminalTurnStatus,
  normalizeSubmitTurnError,
  resolveDispatchProvenance,
  resolutionFromTurnDecision,
  shouldRetryConfirmedCommandAfterIrrelevantStateDrift,
  stampResolutionProvenance,
  stripActionType,
  toInteractionSubmitResult,
  turnStatusForDispatchResult,
  validateTurnSubmission,
  withForcedDomainConfirmation,
  type ResolutionProvenance,
} from "./runtime-dispatch"
import {
  freezeDecisionParams,
  legacyResolutionFromTurnBundle,
  resolveCandidate,
  resolveClarificationAnswer,
  turnFromResolutionBundle,
} from "./runtime-resolution"
import {
  buildGroupObjects,
  canAcceptRegistration,
  createRuntimeOwnerId,
  findObjectIdForDomTarget,
  isIgnoredRuntimeTarget,
  isModalGroupActive,
  isRegistrationOwner,
  readInputEventValue,
  resolveRegisteredNodeLabel,
  shouldObserveMutation,
  stableStringify,
} from "./runtime-snapshot"
import type {
  ActionRegistration,
  InteractionApi,
  RegisteredGroup,
  RegisteredNode,
  RegisteredPage,
  RegisteredVirtualObject,
  RuntimeContextValue,
  SubmitTurnDispatchOptions,
  SubmitTurnResult,
  TurnRuntimeHandle,
} from "./runtime-types"
import {
  createPartialVoiceListeningTurn,
  createPartialVoicePreviewTurn,
  decisionFromResolution,
  getPartialVoiceTurnId,
  previewCandidatesFromResolution,
  resolvePartialVoicePreview,
  resolveVoiceCandidate,
  voiceSessionKey,
} from "./runtime-voice"

export type { InteractionApi, SubmitTurnResult } from "./runtime-types"

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
  const partialVoiceTurnIdsRef = React.useRef(new Map<string, string>())
  const conflictLockRef = React.useRef(new CommandConflictLock())
  const commandCounter = React.useRef(0)
  const turnCounter = React.useRef(0)
  const explicitInvalidationVersionsRef = React.useRef<number[]>([])
  const turnStoreRef = React.useRef(createInteractionTurnStore())
  const turnHandlesRef = React.useRef(new Map<string, TurnRuntimeHandle>())
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
      turnStoreRef.current.create(turn, options)
      if (options.active === false || isTerminalTurnStatus(turn.status)) {
        turnStoreRef.current.clearActive(turn.id)
      }
      setTurnVersion((current) => current + 1)
      onTurnChange?.(turn)
    },
    [onTurnChange]
  )
  const getActiveTurn = React.useCallback(
    () => turnStoreRef.current.getActive(),
    []
  )
  const getTurn = React.useCallback((turnId: string) => turnStoreRef.current.get(turnId), [])

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

  const recordDispatchLifecycle = React.useCallback(
    (command: CommandEnvelope, phaseOrResult: DispatchPhaseEvent | DispatchResult) => {
      const type = dispatchLifecycleEventType(phaseOrResult)
      if (!type) return
      recordEvent({
        modality: command.source.modality,
        type,
        target: dispatchLifecycleTargetId(command, phaseOrResult),
        action: command.kind === "domain" ? command.actionId : command.primitiveAction,
        turnId: command.turnId,
        commandId: command.commandId,
        contextEpoch: command.anchor.contextEpoch,
        modelGenerated: command.source.modelGenerated,
        resolverIds: command.source.resolverIds,
        value: dispatchLifecycleEventValue(phaseOrResult),
      })
    },
    [recordEvent]
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
      const focusOutTargetId =
        event.type === "focusout"
          ? findObjectIdForDomTarget(
              (event as FocusEvent).relatedTarget,
              elementByObjectId.current
            )
          : undefined
      recordEvent({
        modality: "gui",
        type: event.type === "focusin"
          ? "gui.focus.changed"
          : event.type === "focusout"
            ? focusOutTargetId
              ? "gui.focus.changed"
              : "gui.focus.cleared"
          : event.type === "input" || event.type === "change"
            ? "gui.input.changed"
            : "gui.navigation.changed",
        target: event.type === "focusout" ? focusOutTargetId ?? targetId : targetId,
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

  const getOrCreateTurnHandle = React.useCallback((turnId: string) => {
    const existing = turnHandlesRef.current.get(turnId)
    if (existing) return existing

    const handle: TurnRuntimeHandle = {
      resolverGeneration: 0,
      previewGeneration: 0,
      dispatchGeneration: 0,
    }
    turnHandlesRef.current.set(turnId, handle)
    return handle
  }, [])

  const startTurnResolver = React.useCallback(
    (turnId: string, options: { abortOtherResolvers?: boolean } = {}) => {
      if (options.abortOtherResolvers) {
        turnHandlesRef.current.forEach((handle, handleTurnId) => {
          if (handleTurnId !== turnId) {
            handle.resolverAbort?.abort()
          }
        })
      }

      const handle = getOrCreateTurnHandle(turnId)
      handle.resolverAbort?.abort()
      const abortController = new AbortController()
      handle.resolverAbort = abortController
      handle.resolverGeneration += 1
      return {
        abortController,
        generation: handle.resolverGeneration,
      }
    },
    [getOrCreateTurnHandle]
  )

  const startTurnPreview = React.useCallback(
    (turnId: string) => {
      const handle = getOrCreateTurnHandle(turnId)
      handle.previewAbort?.abort()
      const abortController = new AbortController()
      handle.previewAbort = abortController
      handle.previewGeneration += 1
      return {
        abortController,
        generation: handle.previewGeneration,
      }
    },
    [getOrCreateTurnHandle]
  )

  const startTurnDispatch = React.useCallback(
    (turnId: string) => {
      const handle = getOrCreateTurnHandle(turnId)
      handle.dispatchAbort?.abort()
      const abortController = new AbortController()
      handle.dispatchAbort = abortController
      handle.dispatchGeneration += 1
      return {
        abortController,
        generation: handle.dispatchGeneration,
      }
    },
    [getOrCreateTurnHandle]
  )

  const canApplyTurnAsyncResult = React.useCallback(
    (input: {
      turnId: string
      kind: "resolver" | "preview" | "dispatch"
      generation: number
      expectedRevision?: number
      allowAbortedSignal?: boolean
      signal?: AbortSignal
    }) => {
      const turn = turnStoreRef.current.get(input.turnId)
      if (!turn || isTerminalTurnStatus(turn.status)) return false
      if (
        typeof input.expectedRevision === "number" &&
        turn.revision !== input.expectedRevision
      ) {
        return false
      }
      const handle = turnHandlesRef.current.get(input.turnId)
      const currentGeneration =
        input.kind === "resolver"
          ? handle?.resolverGeneration
          : input.kind === "preview"
            ? handle?.previewGeneration
            : handle?.dispatchGeneration

      if (currentGeneration !== input.generation) return false
      if (!input.allowAbortedSignal && input.signal?.aborted) return false
      return true
    },
    []
  )

  const abortTurnRuntimeHandle = React.useCallback((turnId: string) => {
    const handle = turnHandlesRef.current.get(turnId)
    handle?.previewAbort?.abort()
    handle?.resolverAbort?.abort()
    handle?.dispatchAbort?.abort()
  }, [])

  const resolveRuntimeTurn = React.useCallback(
    async (input: {
      turn: InteractionTurn
      snapshot: InteractionSnapshot
      signal: AbortSignal
    }) => {
      const legacyResolver: IntentResolver = {
        id: "react-runtime-legacy",
        resolve: (context) => {
          if (context.voiceInput) {
            return resolveVoiceCandidate(context.voiceInput, context.snapshot, {
              localResolvers,
              resolvers,
              resolverMode,
              signal: context.signal,
              turnId: context.turnId,
            })
          }

          return resolveCandidate(context.utterance, context.snapshot, {
            localResolvers,
            resolvers,
            resolverMode,
            signal: context.signal,
            turnId: context.turnId,
          })
        },
      }
      const bundle = await resolveInteractionTurn({
        turn: input.turn,
        snapshot: input.snapshot,
        contextEpoch: input.snapshot.contextEpoch,
        resolvers: [adaptLegacyIntentResolver(legacyResolver)],
        mode: resolverMode,
        signal: input.signal,
      })

      return {
        turn: turnFromResolutionBundle(input.turn, bundle, input.snapshot),
        bundle,
      }
    },
    [localResolvers, resolverMode, resolvers]
  )

  const resolveText = React.useCallback(
    async (text: string): Promise<InteractionResolutionResult> => {
      // 中文：解析总是基于提交瞬间的 snapshot，并记录 lastResolution 方便调试或 UI 展示。
      // English: Resolution uses the snapshot at submit time and stores lastResolution for debugging or UI display.
      const currentSnapshot = snapshotRef.current
      const activeTurn = turnStoreRef.current.getActive()
      const clarificationResolution = resolveClarificationAnswer(
        text,
        activeTurn,
        currentSnapshot
      )
      if (clarificationResolution && activeTurn) {
        const resolvingTurn = transitionTurn(activeTurn, {
          type: "resolution.started",
          status: "resolving",
        })
        publishTurn(resolvingTurn)
        const resolution = stampResolutionProvenance(clarificationResolution, currentSnapshot, {
          turnId: activeTurn.id,
          modality: "text",
          anchor: activeTurn.anchor,
        })
        const decision = decisionFromResolution(resolution)
        const resolvedTurn = transitionTurn(resolvingTurn, {
          type: "resolution.completed",
          status: "ready",
          candidates: previewCandidatesFromResolution(resolution),
          decision: decision
            ? freezeDecisionParams(resolvingTurn, decision, currentSnapshot)
            : undefined,
        })
        publishTurn(resolvedTurn)
        onTrace?.(completeInteractionTrace(createInteractionTrace(resolvedTurn), {}))
        const readyResolution = resolutionFromTurnDecision(resolvedTurn) ?? resolution
        lastResolutionRef.current = readyResolution
        setLastResolution(readyResolution)
        onResolution?.(readyResolution)
        return {
          snapshot: currentSnapshot,
          resolution: readyResolution,
        }
      }
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
        type: "resolution.started",
        status: "resolving",
      })
      publishTurn(resolvingTurn)
      const resolverHandle = startTurnResolver(turnId, {
        abortOtherResolvers: true,
      })
      const { turn: bundledTurn, bundle } = await resolveRuntimeTurn({
        turn: resolvingTurn,
        snapshot: currentSnapshot,
        signal: resolverHandle.abortController.signal,
      })
      if (
        !canApplyTurnAsyncResult({
          turnId,
          kind: "resolver",
          generation: resolverHandle.generation,
          expectedRevision: resolvingTurn.revision,
          signal: resolverHandle.abortController.signal,
        })
      ) {
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
      const resolvedTurn = bundledTurn
      publishTurn(resolvedTurn)
      onTrace?.(completeInteractionTrace(createInteractionTrace(resolvedTurn), {}))
      const resolution = legacyResolutionFromTurnBundle(resolvedTurn, bundle)
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
    [
      canApplyTurnAsyncResult,
      localResolvers,
      onClarification,
      onResolution,
      onTrace,
      publishTurn,
      resolveRuntimeTurn,
      resolverMode,
      resolvers,
      startTurnResolver,
    ]
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
        const activeTurn = turnStoreRef.current.getActive()
        const clarificationResolution = resolveClarificationAnswer(
          input.text,
          activeTurn,
          currentSnapshot
        )
        if (clarificationResolution && activeTurn) {
          if (input.sessionId) {
            const sessionKey = voiceSessionKey(input)
            const partialTurnId = partialVoiceTurnIdsRef.current.get(sessionKey)
            if (partialTurnId) {
              turnHandlesRef.current.get(partialTurnId)?.previewAbort?.abort()
            }
            partialVoiceTurnIdsRef.current.delete(sessionKey)
          }
          const resolvingTurn = transitionTurn(activeTurn, {
            type: "resolution.started",
            status: "resolving",
          })
          publishTurn(resolvingTurn)
          const resolution = stampResolutionProvenance(clarificationResolution, currentSnapshot, {
            turnId: activeTurn.id,
            modality: "voice",
            anchor: activeTurn.anchor,
          })
          const decision = decisionFromResolution(resolution)
          const resolvedTurn = transitionTurn(resolvingTurn, {
            type: "resolution.completed",
            status: "ready",
            candidates: previewCandidatesFromResolution(resolution),
            decision: decision
              ? freezeDecisionParams(resolvingTurn, decision, currentSnapshot)
              : undefined,
          })
          publishTurn(resolvedTurn)
          const readyResolution = resolutionFromTurnDecision(resolvedTurn) ?? resolution
          lastResolutionRef.current = readyResolution
          setLastResolution(readyResolution)
          onResolution?.(readyResolution)
          onTrace?.(completeInteractionTrace(createInteractionTrace(resolvedTurn), {}))
          return resolvedTurn
        }
      }
      const sessionKey = input.sessionId ? voiceSessionKey(input) : undefined
      const existingSessionTurnId =
        input.kind === "final" && sessionKey
          ? partialVoiceTurnIdsRef.current.get(sessionKey)
          : undefined
      const previousSessionTurn = existingSessionTurnId
        ? turnStoreRef.current.get(existingSessionTurnId)
        : undefined
      const partialSessionKey =
        input.kind === "partial" ? voiceSessionKey(input) : undefined
      const turnId =
        existingSessionTurnId ??
        (partialSessionKey
          ? getPartialVoiceTurnId(
              partialSessionKey,
              partialVoiceTurnIdsRef.current,
              () => `partial_${++turnCounter.current}`
            )
          : `turn_${++turnCounter.current}`)
      const baseCreatedTurn = createInteractionTurn({
        id: turnId,
        source: "voice",
        input,
        anchor: createSnapshotAnchor(currentSnapshot),
        now: input.receivedAt,
      })
      const createdTurn =
        input.kind === "final" && previousSessionTurn
          ? {
              ...baseCreatedTurn,
              revision: previousSessionTurn.revision,
              inputRevision: previousSessionTurn.inputRevision + 1,
              transcriptRevisions: [
                ...(previousSessionTurn.transcriptRevisions ?? []),
                input,
              ].slice(-10),
              phaseHistory: previousSessionTurn.phaseHistory,
            }
          : baseCreatedTurn

      if (input.kind === "partial") {
        if (partialSessionKey) {
          const previousPartialTurnId = partialVoiceTurnIdsRef.current.get(partialSessionKey)
          if (previousPartialTurnId) {
            turnHandlesRef.current.get(previousPartialTurnId)?.previewAbort?.abort()
          }
        }
        const listeningTurn = createPartialVoiceListeningTurn(
          createdTurn,
          turnStoreRef.current.get(turnId)
        )
        publishTurn(listeningTurn, { active: false })
        const previewHandle = startTurnPreview(turnId)
        const preview = await resolvePartialVoicePreview(input, currentSnapshot, {
          localResolvers,
          signal: previewHandle.abortController.signal,
          turnId,
        })
        if (
          !canApplyTurnAsyncResult({
            turnId,
            kind: "preview",
            generation: previewHandle.generation,
            expectedRevision: listeningTurn.revision,
            signal: previewHandle.abortController.signal,
          })
        ) {
          return turnStoreRef.current.get(turnId) ?? listeningTurn
        }
        const previewTurn = createPartialVoicePreviewTurn(
          createdTurn,
          stampResolutionProvenance(preview, currentSnapshot, {
            turnId,
            modality: "voice",
          }),
          turnStoreRef.current.get(turnId)
        )
        publishTurn(previewTurn, { active: false })
        if (preview.status === "resolved" && preview.targetId) {
          applyFeedback(preview.targetId, "voice-target")
        }
        return previewTurn
      }

      if (sessionKey) {
        const partialTurnId = partialVoiceTurnIdsRef.current.get(sessionKey)
        if (partialTurnId) {
          turnHandlesRef.current.get(partialTurnId)?.previewAbort?.abort()
        }
        partialVoiceTurnIdsRef.current.delete(sessionKey)
      }

      const resolvingTurn = transitionTurn(createdTurn, {
        type: "resolution.started",
        status: "resolving",
      })
      publishTurn(resolvingTurn)
      const resolverHandle = startTurnResolver(turnId, {
        abortOtherResolvers: true,
      })

      const { turn: bundledTurn, bundle } = await resolveRuntimeTurn({
        turn: resolvingTurn,
        snapshot: currentSnapshot,
        signal: resolverHandle.abortController.signal,
      })

      if (
        !canApplyTurnAsyncResult({
          turnId,
          kind: "resolver",
          generation: resolverHandle.generation,
          expectedRevision: resolvingTurn.revision,
          signal: resolverHandle.abortController.signal,
        })
      ) {
        return turnStoreRef.current.get(turnId) ?? resolvingTurn
      }

      const resolvedTurn = bundledTurn
      publishTurn(resolvedTurn)
      const resolution = legacyResolutionFromTurnBundle(resolvedTurn, bundle)
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
      canApplyTurnAsyncResult,
      publishTurn,
      recordEvent,
      resolveRuntimeTurn,
      resolverMode,
      resolvers,
      startTurnPreview,
      startTurnResolver,
    ]
  )

  const cancelTurn = React.useCallback(
    (turnId: string, reason = "cancelled") => {
      abortTurnRuntimeHandle(turnId)
      const turn = turnStoreRef.current.get(turnId)
      if (!turn || isTerminalTurnStatus(turn.status)) return

      if (["validating", "executing", "verifying"].includes(turn.status)) {
        return
      }

      try {
        publishTurn(
          transitionTurn(turn, {
            type: "turn.cancelled",
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
    [abortTurnRuntimeHandle, publishTurn]
  )

  const publishDispatchResultTurn = React.useCallback(
    (turnId: string, result: DispatchResult, command?: CommandEnvelope) => {
      const turn = turnStoreRef.current.get(turnId)
      if (!turn || isTerminalTurnStatus(turn.status)) return

      try {
        if (command) recordDispatchLifecycle(command, result)
        let next = turn
        if (next.status === "awaiting_confirmation") {
          next = transitionTurn(next, {
            type: "resolution.completed",
            status: "ready",
          })
        }
        if (next.status === "ready") {
          next = transitionTurn(next, {
            type: "dispatch.phase",
            status: "validating",
          })
        }
        if (result.status === "rejected") {
          next = transitionTurn(next, {
            type: "dispatch.completed",
            status: "rejected",
            result,
            error: dispatchRuntimeError(result),
          })
        } else {
          if (next.status === "validating") {
            next = transitionTurn(next, {
              type: "dispatch.phase",
              status: "executing",
            })
          }
          if (result.status === "failed") {
            next = transitionTurn(next, {
              type: "dispatch.completed",
              status: "failed",
              result,
              error: dispatchRuntimeError(result),
            })
          } else {
            if (next.status === "executing") {
              next = transitionTurn(next, {
                type: "dispatch.phase",
                status: "verifying",
              })
            }
            next = transitionTurn(next, {
              type: "dispatch.completed",
              status: turnStatusForDispatchResult(result),
              result,
              error: result.ok ? undefined : dispatchRuntimeError(result),
            })
          }
        }
        publishTurn(next, { active: false })
        if (result.status === "committed" && result.targetId) {
          setUnifiedFocus((current) =>
            setCoreSemanticFocus(current, result.targetId!, {
              source: focusSourceFromCommandSource(command?.source.modality ?? turn.source),
              confidence: 1,
            })
          )
        }
        onTrace?.(
          completeInteractionTrace(createInteractionTrace(next), {
            status: result.status,
          })
        )
      } catch {
        // Keep dispatch results available to callers even if a legacy turn state cannot transition.
      }
    },
    [onTrace, publishTurn, recordDispatchLifecycle]
  )

  const publishPendingConfirmationTurn = React.useCallback(
    (turnId: string, command: CommandEnvelope, result: DispatchResult) => {
      const turn = turnStoreRef.current.get(turnId)
      if (!turn || isTerminalTurnStatus(turn.status)) return

      recordDispatchLifecycle(command, result)
      const next = transitionTurn(turn, {
        type: "confirmation.requested",
        status: "awaiting_confirmation",
        pendingCommand: command,
        result,
      })
      publishTurn(next)
    },
    [publishTurn, recordDispatchLifecycle]
  )

  const publishDispatchPhaseTurn = React.useCallback(
    (turnId: string, phase: DispatchPhaseEvent, command?: CommandEnvelope) => {
      const turn = turnStoreRef.current.get(turnId)
      if (!turn || isTerminalTurnStatus(turn.status)) return

      try {
        if (command) recordDispatchLifecycle(command, phase)
        let next = turn
        if (phase.phase === "validation" && phase.state === "started") {
          if (next.status === "awaiting_confirmation") {
            next = transitionTurn(next, {
              type: "resolution.completed",
              status: "ready",
              at: phase.at,
              dispatchPhase: phase,
            })
          }
          if (next.status === "ready") {
            next = transitionTurn(next, {
              type: "dispatch.phase",
              status: "validating",
              at: phase.at,
              dispatchPhase: phase,
            })
          }
        } else if (phase.phase === "execution" && phase.state === "started") {
          if (next.status === "validating") {
            next = transitionTurn(next, {
              type: "dispatch.phase",
              status: "executing",
              at: phase.at,
              dispatchPhase: phase,
            })
          }
        } else if (phase.phase === "verification" && phase.state === "started") {
          if (next.status === "executing") {
            next = transitionTurn(next, {
              type: "dispatch.phase",
              status: "verifying",
              at: phase.at,
              dispatchPhase: phase,
            })
          }
        }
        if (next === turn) {
          const phaseStatus = next.status
          if (
            phaseStatus === "validating" ||
            phaseStatus === "executing" ||
            phaseStatus === "verifying"
          ) {
            next = transitionTurn(next, {
              type: "dispatch.phase",
              status: phaseStatus,
              at: phase.at,
              dispatchPhase: phase,
            })
          }
        }
        if (next !== turn) publishTurn(next)
      } catch {
        // Phase events are best-effort mirrors of dispatcher state; final result remains authoritative.
      }
    },
    [publishTurn, recordDispatchLifecycle]
  )

  const ensureTurnForResolution = React.useCallback(
    (
      resolution: ResolvedInteraction,
      provenance: ResolutionProvenance
    ) => {
      if (turnStoreRef.current.get(provenance.turnId)) return

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
        type: "resolution.started",
        status: "resolving",
      })
      const ready =
        resolution.status === "resolved"
          ? transitionTurn(resolving, {
              type: "resolution.completed",
              status: "ready",
            })
          : transitionTurn(resolving, {
              type: "resolution.failed",
              status: "rejected",
              error: {
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
          const validation = createMissingProvenanceValidation()
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
          const dispatchHandle = startTurnDispatch(provenance.turnId)
          const dispatchResult = await dispatchCommand(dispatchSnapshot, command, {
            candidate: resolution,
            utterance: resolution.utterance,
            confirmation: createLegacyConfirmationGrant(command, options.confirmedActionId),
            getSnapshot,
            conflictLock: conflictLockRef.current,
            signal: dispatchHandle.abortController.signal,
            onPhase: (phase) => {
              if (
                canApplyTurnAsyncResult({
                  turnId: provenance.turnId,
                  kind: "dispatch",
                  generation: dispatchHandle.generation,
                  allowAbortedSignal: true,
                })
              ) {
                publishDispatchPhaseTurn(provenance.turnId, phase, command)
              }
            },
          })
          if (
            !canApplyTurnAsyncResult({
              turnId: provenance.turnId,
              kind: "dispatch",
              generation: dispatchHandle.generation,
              allowAbortedSignal: true,
            })
          ) {
            return toInteractionSubmitResult({
              baseResult,
              dispatchResult,
              execution: "domain-action",
              target,
              action,
            })
          }
          if (
            dispatchResult.validation &&
            !dispatchResult.validation.ok &&
            dispatchResult.validation.code === "confirmation_required"
          ) {
            publishPendingConfirmationTurn(provenance.turnId, command, dispatchResult)
          } else {
            publishDispatchResultTurn(provenance.turnId, dispatchResult, command)
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
          const validation = createMissingProvenanceValidation()
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
        const dispatchHandle = startTurnDispatch(provenance.turnId)
        const dispatchResult = await dispatchCommand(currentSnapshot, command, {
          conflictLock: conflictLockRef.current,
          signal: dispatchHandle.abortController.signal,
          onPhase: (phase) => {
            if (
              canApplyTurnAsyncResult({
                turnId: provenance.turnId,
                kind: "dispatch",
                generation: dispatchHandle.generation,
                allowAbortedSignal: true,
              })
            ) {
              publishDispatchPhaseTurn(provenance.turnId, phase, command)
            }
          },
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
        if (
          !canApplyTurnAsyncResult({
            turnId: provenance.turnId,
            kind: "dispatch",
            generation: dispatchHandle.generation,
            allowAbortedSignal: true,
          })
        ) {
          return toInteractionSubmitResult({
            baseResult,
            dispatchResult,
            pendingCommand: undefined,
            execution: "primitive-action",
            target,
          })
        }
        publishDispatchResultTurn(provenance.turnId, dispatchResult, command)

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
      canApplyTurnAsyncResult,
      ensureTurnForResolution,
      getSnapshot,
      publishDispatchPhaseTurn,
      publishDispatchResultTurn,
      publishPendingConfirmationTurn,
      startTurnDispatch,
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

        const provenance = resolveDispatchProvenance(resolution, currentSnapshot, options, {
          allowLegacyBaseStateVersion: true,
        })
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
        conflictLock: conflictLockRef.current,
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
        publishDispatchResultTurn(entry.command.turnId, dispatchResult, entry.command)
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
      const turn = turnStoreRef.current.get(turnId)
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
            type: "resolution.completed",
            status: "ready",
            confirmation,
          })
        )
      } catch {
        // The dispatcher remains the source of truth; transition failures should not reparse or mutate the command.
      }

      applyFeedback(command.targetId, "voice-target")
      applyFeedback(command.targetId, "voice-press")
      const dispatchHandle = startTurnDispatch(turnId)
      let dispatchResult = await dispatchCommand(currentSnapshot, command, {
        confirmation,
        getSnapshot,
        conflictLock: conflictLockRef.current,
        signal: dispatchHandle.abortController.signal,
        onPhase: (phase) => {
          if (
            canApplyTurnAsyncResult({
              turnId,
              kind: "dispatch",
              generation: dispatchHandle.generation,
              allowAbortedSignal: true,
            })
          ) {
            publishDispatchPhaseTurn(turnId, phase, command)
          }
        },
        allowIrrelevantAnchorStateDrift: canAcceptConfirmedCommandAfterIrrelevantStateDrift(
          currentSnapshot,
          command,
          explicitInvalidationVersionsRef.current
        ),
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
        !canApplyTurnAsyncResult({
          turnId,
          kind: "dispatch",
          generation: dispatchHandle.generation,
          allowAbortedSignal: true,
        })
      ) {
        return dispatchResult
      }
      if (dispatchResult.ok) {
        applyFeedback(command.targetId, "success")
        bumpVersion()
      } else {
        applyFeedback(command.targetId, "error")
      }
      publishDispatchResultTurn(turnId, dispatchResult, command)
      return dispatchResult
    },
    [
      applyFeedback,
      bumpVersion,
      canApplyTurnAsyncResult,
      getSnapshot,
      publishDispatchPhaseTurn,
      publishDispatchResultTurn,
      publishTurn,
      startTurnDispatch,
    ]
  )

  const submitTurn = React.useCallback(
    async (
      turnId: string,
      options: SubmitTurnDispatchOptions = {}
    ): Promise<InteractionTurn> => {
      const turn = turnStoreRef.current.get(turnId)
      const validationError = validateTurnSubmission(turnId, turn)
      if (validationError) throw validationError
      const submittableTurn = turn as InteractionTurn & {
        decision: NonNullable<InteractionTurn["decision"]>
      }

      const currentSnapshot = snapshotRef.current
      const command = buildCommandFromTurnDecision({
        commandId: `command_${++commandCounter.current}`,
        turn: submittableTurn,
        snapshot: currentSnapshot,
      })

      const candidate = resolutionFromTurnDecision(submittableTurn)
      const dispatchSnapshot =
        command.kind === "domain" && options.forceConfirmation
          ? withForcedDomainConfirmation(currentSnapshot, command.actionId)
          : currentSnapshot
      const confirmation =
        command.kind === "domain"
          ? createLegacyConfirmationGrant(command, options.confirmedActionId) ??
            submittableTurn.confirmation
          : submittableTurn.confirmation

      applyFeedback(command.targetId, "voice-target")
      applyFeedback(command.targetId, "voice-press")
      const dispatchHandle = startTurnDispatch(turnId)
      const dispatchResult = await dispatchCommand(dispatchSnapshot, command, {
        candidate,
        utterance: submittableTurn.input.text,
        confirmation,
        getSnapshot,
        conflictLock: conflictLockRef.current,
        signal: dispatchHandle.abortController.signal,
        onPhase: (phase) => {
          if (
            canApplyTurnAsyncResult({
              turnId,
              kind: "dispatch",
              generation: dispatchHandle.generation,
              allowAbortedSignal: true,
            })
          ) {
            publishDispatchPhaseTurn(turnId, phase, command)
          }
        },
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
        !canApplyTurnAsyncResult({
          turnId,
          kind: "dispatch",
          generation: dispatchHandle.generation,
          allowAbortedSignal: true,
        })
      ) {
        return turnStoreRef.current.get(turnId) ?? submittableTurn
      }

      if (
        dispatchResult.validation &&
        !dispatchResult.validation.ok &&
        dispatchResult.validation.code === "confirmation_required"
      ) {
        publishPendingConfirmationTurn(turnId, command, dispatchResult)
      } else {
        publishDispatchResultTurn(turnId, dispatchResult, command)
      }

      if (dispatchResult.ok) {
        applyFeedback(command.targetId, "success")
        bumpVersion()
      } else {
        applyFeedback(command.targetId, "error")
      }

      return turnStoreRef.current.get(turnId) ?? submittableTurn
    },
    [
      applyFeedback,
      bumpVersion,
      getSnapshot,
      publishDispatchPhaseTurn,
      publishDispatchResultTurn,
      publishPendingConfirmationTurn,
      canApplyTurnAsyncResult,
      startTurnDispatch,
    ]
  )

  const trySubmitTurn = React.useCallback(
    async (turnId: string): Promise<SubmitTurnResult> => {
      try {
        return {
          ok: true,
          turn: await submitTurn(turnId),
        }
      } catch (error) {
        return {
          ok: false,
          turn: turnStoreRef.current.get(turnId),
          error: normalizeSubmitTurnError(error, turnId),
        }
      }
    },
    [submitTurn]
  )

  const submitVoice = React.useCallback(
    async (input: VoiceInput): Promise<InteractionTurn> => {
      const turn = await resolveVoice(input)
      if (input.kind !== "final" || turn.status !== "ready") return turn

      await submitTurn(turn.id)
      return turnStoreRef.current.get(turn.id) ?? turn
    },
    [resolveVoice, submitTurn]
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

      const turnId = resolution.provenance?.turnId
      const turn = turnId ? turnStoreRef.current.get(turnId) : undefined
      if (resolution.status !== "resolved" || !turnId || !turn) {
        return {
          snapshot: resolvedSnapshot,
          resolution,
          ok: false,
          executed: false,
          error: resolution.reason ?? "No resolved interaction target.",
        }
      }

      try {
        const submittedTurn = await submitTurn(turnId, options)
        const dispatchResult = submittedTurn.result
        if (!dispatchResult) {
          return {
            snapshot: resolvedSnapshot,
            resolution,
            ok: false,
            executed: false,
            pendingCommand: submittedTurn.pendingCommand,
            error: "Turn submission did not produce a dispatch result.",
          }
        }

        return toInteractionSubmitResult({
          baseResult: {
            snapshot: resolvedSnapshot,
            resolution,
          },
          dispatchResult,
          pendingCommand: submittedTurn.pendingCommand,
          execution: dispatchResult.primitiveAction ? "primitive-action" : "domain-action",
          target: resolvedSnapshot.visibleObjects.find((object) => object.id === dispatchResult.targetId),
          action:
            resolution.actionId
              ? ({
                  type: resolution.actionId,
                  ...(resolution.params ?? {}),
                } as ActionPayload)
              : undefined,
        })
      } catch (error) {
        return {
          snapshot: resolvedSnapshot,
          resolution,
          ok: false,
          executed: false,
          error: isOmniError(error)
            ? error.message
            : error instanceof Error
              ? error.message
              : "Turn submission failed.",
        }
      }
    },
    [resolveText, submitTurn]
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
      submitTurn,
      trySubmitTurn,
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
      submitTurn,
      trySubmitTurn,
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

export type UseActionExecutorOptions<TParams extends Record<string, unknown>> = {
  signalSupport?: boolean
  conflictKey?: (input: {
    params: TParams
    target: InteractionObject
    command: CommandEnvelope
  }) => string | undefined
  postcondition?: DomainActionSpec["postcondition"]
}

export function useActionExecutor<TParams extends Record<string, unknown>>(
  action: ActionDefinition<TParams>,
  executor: (
    params: TParams,
    context: ActionContext & { signal?: AbortSignal }
  ) => ActionExecutionResult | Promise<ActionExecutionResult>,
  options: UseActionExecutorOptions<TParams> = {}
): void {
  const actionId = action.id
  const executorRef = React.useRef(executor)
  executorRef.current = executor
  const optionsRef = React.useRef(options)
  optionsRef.current = options

  const actions = React.useMemo<Record<string, DomainActionSpec>>(
    () => ({
      [actionId]: {
        ...action,
        modelCallable: action.modelCallable ?? false,
        voiceCallable: action.voiceCallable ?? true,
        stalePolicy: action.stalePolicy ?? { mode: "strict" },
        conflictKey: options.conflictKey
          ? (context) => {
              const command = context.command
              if (!command) return `${actionId}:${context.target.id}`
              return optionsRef.current.conflictKey?.({
                params: command.params as TParams,
                target: context.target,
                command,
              })
            }
          : action.conflictKey,
        postcondition: options.postcondition ?? action.postcondition,
        execute: (_payload, context) =>
          executorRef.current(context.command?.params as TParams, {
            ...context,
            signal: options.signalSupport ? context.signal : undefined,
          }),
      },
    }),
    [action, actionId, options.conflictKey, options.postcondition, options.signalSupport]
  )

  useInteractionActions({
    namespace: actionId,
    actions,
  })
}

export type CommandInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onSubmit"
> & {
  onSubmit?: (text: string) => void | Promise<void>
}

export const CommandInput = React.forwardRef<HTMLInputElement, CommandInputProps>(
  ({ onSubmit, onKeyDown, ...props }, ref) => {
    const submitUtterance = useSubmitUtterance()
    const [value, setValue] = React.useState("")

    return (
      <input
        {...props}
        ref={ref}
        value={typeof props.value === "string" ? props.value : value}
        onChange={(event) => {
          setValue(event.currentTarget.value)
          props.onChange?.(event)
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event)
          if (event.defaultPrevented || event.key !== "Enter") return
          const text = String((event.currentTarget as HTMLInputElement).value ?? "").trim()
          if (!text) return
          event.preventDefault()
          void Promise.resolve(onSubmit?.(text) ?? submitUtterance(text)).then(() => {
            if (typeof props.value !== "string") setValue("")
          })
        }}
      />
    )
  }
)
CommandInput.displayName = "CommandInput"

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
    submitTurn,
    trySubmitTurn,
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
      submitTurn,
      trySubmitTurn,
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
      submitTurn,
      trySubmitTurn,
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

export function useActiveInteractionTurn(): InteractionTurn | undefined {
  const { getActiveTurn } = useMultimodalRuntime()
  const snapshot = useInteractionSnapshot()
  return React.useMemo(() => getActiveTurn(), [getActiveTurn, snapshot])
}

export function useInteractionTurn(turnId: string | undefined): InteractionTurn | undefined {
  const { getTurn } = useMultimodalRuntime()
  const snapshot = useInteractionSnapshot()
  return React.useMemo(() => (turnId ? getTurn(turnId) : undefined), [getTurn, snapshot, turnId])
}

export function useInteractionTrace(turnId: string | undefined): InteractionTrace | undefined {
  const turn = useInteractionTurn(turnId)
  return React.useMemo(() => (turn ? createInteractionTrace(turn) : undefined), [turn])
}

export function useSubmitUtterance(): (
  text: string,
  options?: InteractionSubmitOptions
) => Promise<InteractionSubmitResult> {
  return useMultimodalRuntime().submitUtterance
}
