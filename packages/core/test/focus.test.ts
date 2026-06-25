import { describe, expect, it } from "vitest"
import {
  createInteractionSnapshot,
  createUnifiedFocus,
  reduceFocusEvent,
  setSemanticFocus,
} from "../src"

describe("unified focus reducer", () => {
  it("uses business objects for semantic focus and keeps input focus separate", () => {
    let focus = createUnifiedFocus()
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [
        { id: "todo.1", type: "composite", role: "list_item", label: "写方案" },
        { id: "input.title", type: "raw", role: "textbox", label: "标题", parent: "todo.1" },
      ],
    })

    focus = reduceFocusEvent(
      focus,
      {
        id: "event_1",
        sequence: 1,
        modality: "gui",
        type: "gui.pointer.activated",
        target: "todo.1",
        snapshotId: snapshot.snapshotId,
        baseStateVersion: snapshot.stateVersion,
        timestamp: 100,
      },
      snapshot
    )
    focus = reduceFocusEvent(
      focus,
      {
        id: "event_2",
        sequence: 2,
        modality: "gui",
        type: "gui.focus.changed",
        target: "input.title",
        snapshotId: snapshot.snapshotId,
        baseStateVersion: snapshot.stateVersion,
        timestamp: 120,
      },
      snapshot
    )

    expect(focus.semanticFocus?.objectId).toBe("todo.1")
    expect(focus.inputFocus?.objectId).toBe("input.title")
    expect(focus.recentTargets.map((target) => target.objectId)).toEqual(["todo.1"])
  })

  it("ignores raw pointer targets for semantic focus", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [
        { id: "button.raw", type: "raw", role: "button", label: "删除" },
      ],
    })
    const focus = reduceFocusEvent(
      createUnifiedFocus(),
      {
        id: "event_1",
        modality: "gui",
        type: "gui.pointer.activated",
        target: "button.raw",
        snapshotId: snapshot.snapshotId,
        baseStateVersion: snapshot.stateVersion,
        timestamp: 100,
      },
      snapshot
    )

    expect(focus.semanticFocus).toBeUndefined()
  })

  it("prunes expired or disappeared focus targets", () => {
    const focus = setSemanticFocus(createUnifiedFocus(), "todo.1", {
      timestamp: 100,
      ttlMs: 50,
    })
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [{ id: "todo.1", type: "composite", role: "list_item" }],
      unifiedFocus: focus,
    })
    const next = reduceFocusEvent(
      focus,
      {
        id: "event_1",
        modality: "gui",
        type: "gui.navigation.changed",
        snapshotId: snapshot.snapshotId,
        baseStateVersion: snapshot.stateVersion,
        timestamp: 200,
      },
      snapshot
    )

    expect(next.semanticFocus).toBeUndefined()
    expect(next.revision).toBeGreaterThan(focus.revision)
  })
})
