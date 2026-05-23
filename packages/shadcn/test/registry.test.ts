import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"

const registryPath = path.resolve("registry/registry.json")

describe("shadcn registry source", () => {
  it("defines the expected multimodal registry items", async () => {
    const registry = JSON.parse(await readFile(registryPath, "utf8")) as {
      items: Array<{ name: string; files: Array<{ path: string; target: string }> }>
    }

    expect(registry.items.map((item) => item.name)).toEqual([
      "multimodal-provider",
      "multimodal-button",
      "multimodal-input",
      "multimodal-checkbox",
      "multimodal-switch",
      "multimodal-slider",
      "multimodal-tabs",
      "multimodal-dialog",
      "multimodal-form-field",
      "multimodal-list-item",
    ])

    for (const item of registry.items) {
      expect(item.files[0].target).toMatch(/^components\/multimodal\//)
      await expect(readFile(path.resolve(item.files[0].path), "utf8")).resolves.toContain(
        "@multimodal-ui/react"
      )
    }
  })
})
