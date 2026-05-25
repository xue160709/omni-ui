import react from "@vitejs/plugin-react"
import path from "node:path"
import { defineConfig } from "vitest/config"

const usePackageConsumerMode = process.env.OMNIUI_PACKAGE_CONSUMER === "1"

export default defineConfig({
  plugins: [react()],
  resolve: usePackageConsumerMode
    ? undefined
    : {
        alias: [
          {
            find: "@omni-ui/react/styles.css",
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
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.tsx"],
  },
})
