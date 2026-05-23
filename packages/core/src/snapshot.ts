import { attachDomainActions } from "./action-registry"
import type {
  ContextObject,
  FocusInfo,
  InteractionEvent,
  InteractionObject,
  InteractionSnapshot,
  PageObject,
  RegisteredActionSpec,
} from "./types"

let snapshotCounter = 0

export type CreateSnapshotInput = {
  stateVersion: number
  page?: PageObject
  contextStack?: ContextObject[]
  visibleObjects: InteractionObject[]
  focus?: FocusInfo
  recentEvents?: InteractionEvent[]
  actionSpecs?: Record<string, RegisteredActionSpec>
  session?: InteractionSnapshot["session"]
}

export function createInteractionSnapshot(input: CreateSnapshotInput): InteractionSnapshot {
  const snapshotId = `snapshot_${++snapshotCounter}`
  const actionSpecs = input.actionSpecs ?? {}
  const base = {
    snapshotId,
    stateVersion: input.stateVersion,
    session: input.session,
    contextStack:
      input.contextStack ??
      (input.page
        ? [
            {
              type: "page" as const,
              id: input.page.id,
              title: input.page.title,
            },
          ]
        : []),
    page: input.page,
    focus: input.focus,
    recentEvents: input.recentEvents ?? [],
    actionSpecs,
  }

  const objects = input.page
    ? [input.page, ...input.visibleObjects.filter((object) => object.id !== input.page?.id)]
    : input.visibleObjects

  return {
    ...base,
    visibleObjects: attachDomainActions(objects, actionSpecs, {
      ...base,
    }),
  }
}

export function compactSnapshotForIntent(snapshot: InteractionSnapshot): InteractionSnapshot {
  return {
    ...snapshot,
    visibleObjects: snapshot.visibleObjects.map((object) => ({
      id: object.id,
      type: object.type,
      role: object.role,
      label: object.label,
      aliases: object.aliases,
      parent: object.parent,
      entity: object.entity,
      state: object.state,
      actions: object.actions,
      primitiveActions: object.actions?.length ? undefined : object.primitiveActions,
      options: object.options,
    })),
  }
}
