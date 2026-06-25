import { describe, expect, it } from "vitest"
import {
  assertProtocolEnvelope,
  negotiateProtocolVersion,
  OMNI_UI_PROTOCOL_VERSION,
  serializeDispatchResult,
} from "../src/protocol"

describe("protocol helpers", () => {
  it("negotiates the supported protocol version", () => {
    expect(negotiateProtocolVersion(["2.0", OMNI_UI_PROTOCOL_VERSION])).toEqual({
      status: "compatible",
      version: OMNI_UI_PROTOCOL_VERSION,
    })
    expect(negotiateProtocolVersion("0.9")).toEqual({
      status: "incompatible",
      requested: ["0.9"],
      supported: [OMNI_UI_PROTOCOL_VERSION],
    })
  })

  it("serializes and validates dispatch result envelopes", () => {
    const envelope = serializeDispatchResult({
      ok: true,
      status: "committed",
      commandId: "command_1",
      turnId: "turn_1",
      targetId: "task.item.task_1",
      actionId: "task.complete",
    })

    expect(envelope).toMatchObject({
      protocolVersion: OMNI_UI_PROTOCOL_VERSION,
      kind: "dispatch_result",
      result: {
        status: "committed",
      },
    })
    expect(() => assertProtocolEnvelope(envelope)).not.toThrow()
    expect(() =>
      assertProtocolEnvelope({ ...envelope, protocolVersion: "2.0" })
    ).toThrow(/Unsupported OmniUI protocol version/)
  })
})
