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
      "multimodal-button-group",
      "multimodal-input",
      "multimodal-input-otp",
      "multimodal-input-group",
      "multimodal-checkbox",
      "multimodal-radio-group",
      "multimodal-switch",
      "multimodal-toggle",
      "multimodal-toggle-group",
      "multimodal-slider",
      "multimodal-tabs",
      "multimodal-accordion",
      "multimodal-collapsible",
      "multimodal-textarea",
      "multimodal-select",
      "multimodal-native-select",
      "multimodal-command",
      "multimodal-combobox",
      "multimodal-dropdown-menu",
      "multimodal-context-menu",
      "multimodal-menubar",
      "multimodal-navigation-menu",
      "multimodal-breadcrumb",
      "multimodal-sidebar",
      "multimodal-popover",
      "multimodal-tooltip",
      "multimodal-hover-card",
      "multimodal-sheet",
      "multimodal-drawer",
      "multimodal-calendar",
      "multimodal-carousel",
      "multimodal-date-picker",
      "multimodal-sonner",
      "multimodal-toast",
      "multimodal-card",
      "multimodal-alert",
      "multimodal-empty",
      "multimodal-dialog",
      "multimodal-alert-dialog",
      "multimodal-form-field",
      "multimodal-field",
      "multimodal-list-item",
      "multimodal-item",
      "multimodal-assistant-panel",
      "multimodal-form",
      "multimodal-table",
      "multimodal-scroll-area",
      "multimodal-progress",
      "multimodal-resizable",
      "multimodal-pagination",
      "multimodal-data-table",
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
