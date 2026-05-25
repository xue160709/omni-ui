import {
  NAVIGATION_BACK_ACTION_ID,
  NAVIGATION_FORWARD_ACTION_ID,
  NAVIGATION_GOTO_ACTION_ID,
  type ActionContext,
  type ActionPayload,
  type ExecuteScope,
  type InteractionObject,
} from "@omni-ui/core"
import * as React from "react"
import { useInteractionActions, useInteractionManifest, useInteractionObjects } from "./runtime"

export type InteractionRoute<TRoute = unknown> = {
  id: string
  label: string
  route: TRoute
  path?: string
  aliases?: string[]
  active?: boolean
  state?: Record<string, unknown>
}

export type NavigationActionPayload = ActionPayload & {
  routeId?: string
  path?: string
}

export type UseInteractionRoutesOptions<TRoute = unknown> = {
  namespace?: string
  actionId?: string
  role?: string
  executeScope?: ExecuteScope
  routes: Array<InteractionRoute<TRoute>>
  execute: (
    route: TRoute,
    item: InteractionRoute<TRoute>,
    action: NavigationActionPayload,
    context: ActionContext
  ) => void | Promise<void>
}

// 中文：把应用路由注册为 manifest route、snapshot object 和 navigation action 三件事，供本地规则和 LLM 共用。
// English: Registers app routes as manifest routes, snapshot objects, and a navigation action shared by rules and LLMs.
export function useInteractionRoutes<TRoute = unknown>(
  options: UseInteractionRoutesOptions<TRoute>
): void {
  const namespace = options.namespace ?? "navigation"
  const actionId =
    options.actionId ??
    (namespace === "navigation" ? NAVIGATION_GOTO_ACTION_ID : `${namespace}.goto`)
  const role = options.role ?? "route"
  const executeScope = options.executeScope ?? "app"

  const routeObjects = React.useMemo<InteractionObject[]>(
    // 中文：路由对象即使页面未渲染也可被解析器发现，用于跨页面导航。
    // English: Route objects can be discovered by resolvers even when their pages are not currently rendered.
    () =>
      options.routes.map((route) => ({
        id: route.id,
        type: "composite",
        role,
        label: route.label,
        aliases: route.aliases,
        source: "registered_route",
        state: {
          routeId: route.id,
          path: route.path,
          active: route.active,
          ...(route.state ?? {}),
        },
      })),
    [options.routes, role]
  )

  const routesRef = React.useRef(options.routes)
  routesRef.current = options.routes
  const executeRef = React.useRef(options.execute)
  executeRef.current = options.execute

  useInteractionObjects(routeObjects)

  useInteractionManifest(
    {
      routes: options.routes.map((route) => ({
        id: route.id,
        label: route.label,
        aliases: route.aliases,
        path: route.path,
        active: route.active,
        state: route.state,
        actionId,
      })),
      actions: [
        {
          id: actionId,
          namespace,
          attachTo: { role },
          executeScope,
        },
      ],
    },
    `${namespace}.routes`
  )

  const actions = React.useMemo(
    () => ({
      [actionId]: {
        attachTo: { role },
        executeScope,
        // 中文：从被命中的 route object 提取业务路由参数，交给应用的 execute 回调。
        // English: Reads route params from the matched route object before invoking the app's execute callback.
        paramsFrom: ({ target }: ActionContext) => ({
          routeId: String(target.state?.routeId ?? target.id),
          path: typeof target.state?.path === "string" ? target.state.path : undefined,
        }),
      },
    }),
    [actionId, executeScope, role]
  )

  useInteractionActions<NavigationActionPayload>({
    namespace,
    actions,
    execute: (action, context) => {
      const routeId = String(action.routeId ?? "")
      const item = routesRef.current.find((candidate) => candidate.id === routeId)
      if (!item) return
      return executeRef.current(item.route, item, action, context)
    },
  })
}

export type NavigationHistoryActionPayload = ActionPayload & {
  type:
    | typeof NAVIGATION_BACK_ACTION_ID
    | typeof NAVIGATION_FORWARD_ACTION_ID
    | string
}

export type NavigationHistoryAvailability =
  | boolean
  | ((context: ActionContext) => boolean)

export type NavigationHistoryExecutor = (
  action: NavigationHistoryActionPayload,
  context: ActionContext
) => void | Promise<void>

export type UseInteractionNavigationHistoryOptions = {
  namespace?: string
  backActionId?: string
  forwardActionId?: string
  executeScope?: ExecuteScope
  canGoBack?: NavigationHistoryAvailability
  canGoForward?: NavigationHistoryAvailability
  goBack: NavigationHistoryExecutor
  goForward: NavigationHistoryExecutor
}

// 中文：把浏览器/应用历史注册成通用 navigation.back / navigation.forward 动作，具体历史实现仍由应用拥有。
// English: Registers browser/app history as generic navigation.back / navigation.forward actions while the app owns the actual history implementation.
export function useInteractionNavigationHistory(
  options: UseInteractionNavigationHistoryOptions
): void {
  const namespace = options.namespace ?? "navigation-history"
  const backActionId = options.backActionId ?? NAVIGATION_BACK_ACTION_ID
  const forwardActionId = options.forwardActionId ?? NAVIGATION_FORWARD_ACTION_ID
  const executeScope = options.executeScope ?? "page"
  const optionsRef = React.useRef(options)
  optionsRef.current = options

  const actions = React.useMemo(
    () => ({
      [backActionId]: {
        executeScope,
        availableWhen: (context: ActionContext) =>
          resolveNavigationHistoryAvailability(
            optionsRef.current.canGoBack,
            context,
            "canGoBack"
          ),
      },
      [forwardActionId]: {
        executeScope,
        availableWhen: (context: ActionContext) =>
          resolveNavigationHistoryAvailability(
            optionsRef.current.canGoForward,
            context,
            "canGoForward"
          ),
      },
    }),
    [backActionId, executeScope, forwardActionId]
  )

  useInteractionActions<NavigationHistoryActionPayload>({
    namespace,
    actions,
    execute: (action, context) => {
      if (action.type === backActionId) {
        return optionsRef.current.goBack(action, context)
      }

      if (action.type === forwardActionId) {
        return optionsRef.current.goForward(action, context)
      }
    },
  })
}

function resolveNavigationHistoryAvailability(
  value: NavigationHistoryAvailability | undefined,
  context: ActionContext,
  stateKey: "canGoBack" | "canGoForward"
): boolean {
  if (typeof value === "function") return value(context)
  if (typeof value === "boolean") return value
  return context.target.state?.[stateKey] === true
}
