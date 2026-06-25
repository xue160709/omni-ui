import react from "@vitejs/plugin-react"
import path from "node:path"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@omni-ui/react/styles",
        replacement: path.resolve(__dirname, "../../packages/react/src/styles.css"),
      },
      {
        find: "@omni-ui/core",
        replacement: path.resolve(__dirname, "../../packages/core/src/index.ts"),
      },
      {
        find: "@omni-ui/react",
        replacement: path.resolve(__dirname, "../../packages/react/src/index.ts"),
      },
    ],
  },
})
