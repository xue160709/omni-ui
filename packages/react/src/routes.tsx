import type {
  ActionContext,
  ActionPayload,
  ExecuteScope,
  InteractionObject,
} from "@multimodal-ui/core"
import * as React from "react"
import { useInteractionActions, useInteractionObjects } from "./runtime"

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

export function useInteractionRoutes<TRoute = unknown>(
  options: UseInteractionRoutesOptions<TRoute>
): void {
  const namespace = options.namespace ?? "navigation"
  const actionId = options.actionId ?? `${namespace}.goto`
  const role = options.role ?? "route"
  const executeScope = options.executeScope ?? "app"

  const routeObjects = React.useMemo<InteractionObject[]>(
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

  const actions = React.useMemo(
    () => ({
      [actionId]: {
        attachTo: { role },
        executeScope,
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
