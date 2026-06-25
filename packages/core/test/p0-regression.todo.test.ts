import { describe, it } from "vitest"

describe("P0 VUI + GUI runtime regression coverage", () => {
  it.todo("P0-01 binds confirmation to turn, target, action, params, anchor, and context")
  it.todo("P0-02 rejects execution when action spec does not attach to the resolved target")
  it.todo("P0-03 validates resolver and model params with RuntimeSchema before execution")
  it.todo("P0-04 routes primitive actions through the same command dispatcher validation chain")
  it.todo("P0-05 reports primitive unsupported and noop results without claiming success")
  it.todo("P0-06 redacts sensitive input values from model snapshots and trace output")
  it.todo("P0-07 treats GUI text as untrusted structured data in model prompts")
  it.todo("P0-08 ignores stale resolver results after a turn is superseded or aborted")
  it.todo("P0-09 rejects detached dispatch requests that do not carry the original snapshot anchor")
})
