import react from "@vitejs/plugin-react"
import path from "node:path"
import { defineConfig } from "vitest/config"

const usePackageConsumerMode = process.env.MULTIMODAL_PACKAGE_CONSUMER === "1"

export default defineConfig({
  plugins: [react()],
  resolve: usePackageConsumerMode
    ? undefined
    : {
        alias: [
          {
            find: "@multimodal-ui/react/styles.css",
            replacement: path.resolve(__dirname, "../../packages/react/src/styles.css"),
          },
          {
            find: "@multimodal-ui/core",
            replacement: path.resolve(__dirname, "../../packages/core/src/index.ts"),
          },
          {
            find: "@multimodal-ui/react",
            replacement: path.resolve(__dirname, "../../packages/react/src/index.ts"),
          },
        ],
      },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.tsx"],
  },
})
