import react from "@vitejs/plugin-react"
import type { IncomingMessage, ServerResponse } from "node:http"
import path from "node:path"
import { defineConfig, loadEnv, type Plugin } from "vite"

const siliconFlowUrl = "https://api.siliconflow.cn/v1/chat/completions"
const defaultModel = "MiniMaxAI/MiniMax-M2.5"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "")
  const apiKey = env.SILICONFLOW_API_KEY || process.env.SILICONFLOW_API_KEY

  return {
    plugins: [react(), siliconFlowChatPlugin(() => apiKey)],
    resolve: {
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
    server: {
      host: "127.0.0.1",
      port: 5173,
    },
  }
})

function siliconFlowChatPlugin(getApiKey: () => string | undefined): Plugin {
  const middleware = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: (error?: unknown) => void
  ) => {
    if (!req.url?.startsWith("/api/chat") || req.method !== "POST") {
      next()
      return
    }

    const requestApiKey = readHeader(req.headers["x-siliconflow-api-key"])
    const apiKey = requestApiKey || getApiKey()
    if (!apiKey) {
      sendJson(res, 400, {
        error: "未配置 SILICONFLOW_API_KEY",
      })
      return
    }

    try {
      const body = await readJsonBody(req)
      const messages = Array.isArray(body.messages) ? body.messages : []

      if (messages.length === 0) {
        sendJson(res, 400, { error: "messages 不能为空" })
        return
      }

      const upstream = await fetch(siliconFlowUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: typeof body.model === "string" ? body.model : defaultModel,
          messages,
        }),
      })
      const text = await upstream.text()

      res.statusCode = upstream.status
      res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/json")
      res.end(text)
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : "LLM 请求失败",
      })
    }
  }

  return {
    name: "siliconflow-chat-proxy",
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const text = await new Promise<string>((resolve, reject) => {
    let body = ""
    req.setEncoding("utf8")
    req.on("data", (chunk: string) => {
      body += chunk
      if (body.length > 1_000_000) {
        reject(new Error("请求体过大"))
        req.destroy()
      }
    })
    req.on("end", () => resolve(body))
    req.on("error", reject)
  })

  return text ? (JSON.parse(text) as Record<string, unknown>) : {}
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode
  res.setHeader("Content-Type", "application/json")
  res.end(JSON.stringify(payload))
}

function readHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}
