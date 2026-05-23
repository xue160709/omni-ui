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
      "multimodal-utils",
      "multimodal-button",
      "multimodal-input",
      "multimodal-checkbox",
      "multimodal-switch",
      "multimodal-slider",
      "multimodal-tabs",
      "multimodal-textarea",
      "multimodal-select",
      "multimodal-command",
      "multimodal-dropdown-menu",
      "multimodal-sonner",
      "multimodal-card",
      "multimodal-dialog",
      "multimodal-form-field",
      "multimodal-list-item",
    ])

    for (const item of registry.items) {
      expect(item.files[0].target).toMatch(/^components\/multimodal\//)
      const content = await readFile(path.resolve(item.files[0].path), "utf8")
      if (item.name !== "multimodal-utils") {
        expect(content).toContain("@multimodal-ui/react")
      }
      if (item.name !== "multimodal-provider" && item.name !== "multimodal-utils") {
        expect(item.files[0].target).not.toMatch(/^components\/ui\//)
      }
    }
  })
})
