# OmniUI

[English](README.md) | [中文](README_CN.md)

OmniUI 让已有 React 页面在不更换 UI 组件库、不接管业务状态的前提下，安全支持文本、语音和 AI 辅助命令。

OmniUI 不拥有你的业务状态。业务 action 和 executor 由应用自己拥有。模型不能直接调用业务代码，只能提出候选命令，再由本地校验、策略、确认和 executor 执行。

## 状态

当前状态：alpha。
包版本：`0.1.0`。
协议版本：`1.0`。

在准备 GitHub Release 和 npm 发布前，变更记录统一放在 [Unreleased](CHANGELOG.md) 下。

## 安装

大多数 React 项目只需要：

```bash
npm install @omni-ui/react
```

当前仓库仍处于 pre-release。如果你的 npm 环境还没有对应发布包，请先用 `npm run verify:package-consumer` 生成并验证本地 tarball。

默认样式需要显式导入：

```ts
import "@omni-ui/react/styles.css"
```

`@omni-ui/react` 根入口不会自动导入 CSS。

## 应该使用哪个包？

- 大多数 React 应用：`@omni-ui/react`
- 框架无关协议、校验、CommandEnvelope、resolver adapter 或服务端集成：`@omni-ui/core`
- 可选的 shadcn/ui 源码组件和 registry recipe：`@omni-ui/shadcn`

使用 OmniUI runtime 不需要 shadcn。React 应用通常也不需要手动安装 `@omni-ui/core`，因为它已经是 `@omni-ui/react` 的依赖，并由 React 包重新导出常用 API。

## 5 分钟本地命令

首次接入不需要 LLM API Key、麦克风权限、shadcn 或 server resolver。

完整教程见 [中文 Quick Start](docs/getting-started/quick-start.zh-CN.md)，可构建示例见 [`examples/react-vite-minimal`](examples/react-vite-minimal/)。

核心路径是：

```text
用户输入
  -> Snapshot + Manifest
  -> Resolver Chain
  -> Validation / Policy / Confirmation
  -> CommandEnvelope
  -> Dispatcher
  -> 应用自己的 Executor
  -> Feedback / DevTools
```

输入 `完成第一个任务` 时，本地 rule 会解析当前可见 Todo，校验 `todo.complete`，执行应用自己的 executor，并返回 `{ status: "changed" }`。

## 文档

- [Quick Start](docs/getting-started/quick-start.md)
- [中文 Quick Start](docs/getting-started/quick-start.zh-CN.md)
- [概念说明](docs/concepts/index.md)
- [DevTools](docs/guides/devtools.md)
- [错误码](docs/troubleshooting/error-codes.md)
- [安全与模型密钥](docs/architecture/security.md)
- [Server Resolver](docs/guides/server-resolver.md)
- [发布流程](docs/release.md)

## 示例

- [`examples/react-vite-minimal`](examples/react-vite-minimal/)：首条本地命令路径，不需要模型 key。
- [`apps/demo-todo`](apps/demo-todo/)：更完整 demo、可选 registry 输出和 package-consumer 验证。

## 本地开发

```bash
npm install
npm run dev
npm run verify:release
```

`npm run dev` 启动 `apps/demo-todo` 开发服务器。`npm run verify:release` 会运行类型检查、单测、构建、registry 验证、最小示例和 package tarball consumer 验证。

贡献者说明见 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [packages/README.md](packages/README.md)。
