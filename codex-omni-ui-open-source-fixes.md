# 给 Codex 的 OmniUI 开源化修改任务说明

> 目标：请基于当前 `omni-ui` 仓库状态，完成一轮面向开源发布和首次接入体验的收尾修改。  
> 重点不是增加新功能，而是让陌生开发者第一次进入仓库后，能快速理解、安装、接入、验证，并且让发布、文档、示例和版本口径保持一致。

---

## 0. 执行原则

请先阅读当前仓库的实际文件，再修改。以下建议以当前仓库已有设计为基础，但最终以仓库真实代码为准。

### 必须遵守

1. 不要大规模重构核心运行时。
2. 不要引入新的框架或复杂依赖。
3. 不要凭空创造与现有 API 不一致的新 API。
4. 不要把高级能力塞回 README 主线。
5. 不要在 README 中声称已经发布稳定版，除非仓库和 npm/Release 状态确实支持。
6. 示例代码必须能被 CI 编译验证。
7. 文档中的安装命令、导入路径、包名、版本号必须与实际仓库一致。
8. 如果发现本文中的路径与实际仓库不一致，请优先保持项目现有结构，并在同等语义下完成修改。
9. 所有修改应尽量小步、可审查、可回滚。
10. 修改完成后请运行仓库已有的验证命令，并补充必要的新验证命令。

---

## 1. 本轮修改总目标

当前项目已经具备较完整的系统能力，包括：

- `@omni-ui/core`
- `@omni-ui/react`
- Snapshot
- Manifest
- Action / Executor
- Resolver Chain
- CommandEnvelope
- Dispatcher
- Policy / Validation / Confirmation
- 可选 DevTools
- 可选 shadcn Registry
- 最小 Vite 示例

本轮要解决的是“开源项目最后一公里”：

```text
打开 README
    ↓
知道该安装哪个包
    ↓
复制最小示例
    ↓
不配置模型 API Key
    ↓
输入一条本地文本命令
    ↓
看到页面状态变化
    ↓
知道如何调试
    ↓
知道如何继续接入 LLM、语音、shadcn 或服务端 Resolver
    ↓
CI 证明示例和发布包可以工作
```

---

## 2. 优先级

请按以下优先级处理。

### P0：本轮必须完成

1. 统一版本、CHANGELOG、README Roadmap 的口径。
2. 重写根 README 的首屏与主线，让它消费者优先。
3. 将主教程移出 `packages/`，放到 `docs/getting-started/`。
4. 确保 `examples/react-vite-minimal` 是文档代码的主要参考。
5. 增加 `verify:release` 脚本，并让它覆盖 examples 和 package consumer 验证。
6. 新增或完善 GitHub Actions CI。
7. 明确 CSS 导入策略。
8. 修复命名残留，例如 `docs dev server` 与 `demo-todo` 的混淆。
9. 新增 Troubleshooting / Error Codes 文档骨架。
10. 确保 README、文档、package exports、示例代码之间没有明显漂移。

### P1：可以在 P0 后顺手完成

1. 加强 DevTools 文档说明。
2. 增加 Next.js / React Router / Server Resolver 示例占位文档。
3. 补充发布流程文档。
4. 增加隐私与模型密钥安全说明。
5. 增加贡献者本地开发说明链接，但不要放在 README 首屏。

### 暂不处理

1. 不要实现全新的 DevTools Inspector 大功能。
2. 不要一次性新增多个框架 Runtime。
3. 不要重写 Resolver 架构。
4. 不要拆包为大量新 npm 包。
5. 不要引入新的文档站框架，除非仓库中已经存在相关基础。

---

## 3. 修改任务详情

---

# Task 1：统一版本与发布状态口径

## 问题

仓库中可能同时存在以下不一致情况：

```text
packages/*/package.json: 0.1.0
CHANGELOG.md: 已经出现 0.2.0 / 0.3.0
README Roadmap: 又描述 v0.1 / v0.2 / v0.3 / v0.4
GitHub Release: 可能还没有正式 release
```

这会让开源用户不确定当前版本是否已经发布、当前能力是否稳定、安装命令是否真实可用。

## 修改要求

请检查以下文件：

```text
package.json
packages/core/package.json
packages/react/package.json
packages/shadcn/package.json
CHANGELOG.md
README.md
docs/release.md
.changeset/config.json
```

然后统一口径。

### 如果当前 package 版本仍是 `0.1.0`

请将 CHANGELOG 调整为类似：

```md
# Changelog

## Unreleased

### Added

- Consumer-first README.
- Five-minute local command quick start.
- Standalone React Vite minimal example.
- Protocol version serialization.
- Package consumer verification.

### Changed

- Clarified package responsibilities.
- Clarified React/shadcn/core usage paths.

### Fixed

- CSS side effect configuration.
- Documentation entry confusion.
```

不要写成已经发布 `0.2.0`、`0.3.0`。

README 中版本状态建议写成：

```md
Current status: alpha.
```

或者：

```md
Current status: pre-release.
```

### 如果当前 package 版本已经是 `0.2.0` 或 `0.3.0`

请确保所有 package、CHANGELOG、README、Release 文档中的版本号一致。

## 验收标准

- 全仓库搜索 `0.2.0`、`0.3.0`、`0.4.0` 时，不存在互相冲突的发布状态描述。
- README 不声称不存在的 GitHub Release。
- CHANGELOG 与 package versions 一致。
- Roadmap 明确区分“当前版本”和“未来计划”。

---

# Task 2：重写根 README 主线

## 目标

根 README 应优先回答消费者问题：

1. OmniUI 是什么？
2. 我是否适合使用？
3. 应该安装哪个包？
4. 五分钟内怎么跑通第一条命令？
5. 之后去哪里看完整教程？
6. 如何开发和贡献？

## 推荐结构

请将 README 调整为以下信息架构。可以保留现有内容，但需要降噪、移动高级内容到 docs。

```md
# OmniUI

一句话介绍：让现有 React 页面在不更换 UI 组件库的前提下，安全支持文本、语音和 AI 辅助命令。

## Status

Current status: alpha / pre-release.
Protocol version: 1.0.
Package version: 以当前 package.json 为准。

## Installation

已有 React 项目：

npm install @omni-ui/react

如果暂未发布 npm，请不要写成稳定安装方式，而是说明当前安装方式。

## Which package should I use?

- Most React apps: @omni-ui/react
- Framework-agnostic protocol / server adapters: @omni-ui/core
- shadcn/ui source components: @omni-ui/shadcn 或 @omni-ui/shadcn-registry

## 5-Minute Local Command

首次体验不需要：
- LLM API key
- microphone permission
- shadcn/ui
- server resolver

复制最小示例，输入“完成第一个任务”，看到页面变化。

## How OmniUI Works

用一张短链路图解释：

User input
  -> Snapshot + Manifest
  -> Resolver Chain
  -> Validation / Policy / Confirmation
  -> CommandEnvelope
  -> Dispatcher
  -> App-owned Executor
  -> Feedback / DevTools

## Examples

- examples/react-vite-minimal
- apps/demo-todo

## Documentation

- Quick Start
- Concepts
- Guides
- Troubleshooting
- Release

## Development

贡献者启动仓库的命令放在这里，不要放在首屏。
```

## README 中需要保留的关键句

请在 README 靠前位置保留类似说明：

```md
OmniUI does not own your business state.
Your app owns actions and executors.
The model never calls business code directly; it can only propose commands that are validated locally.
```

中文或英文均可，但仓库主 README 如果已有英文风格，请保持英文主文档，中文教程可放在 `docs/getting-started/quick-start.zh-CN.md`。

## 需要移动出 README 的内容

以下内容不要塞在 README 主线中，可以移动到 docs：

- Assistant 高级 API
- Voice / ASR / TTS 细节
- Route helpers 细节
- 所有低层 primitives 细节
- LLM Resolver 深入配置
- Server key 配置细节
- 完整协议说明
- Runtime architecture 长说明

## 验收标准

- README 首屏能看到安装路径和 5 分钟接入入口。
- README 不再以 `npm install && npm run dev` 作为第一路径。
- 高级 API 不干扰首次接入。
- README 中出现的代码可以在 example 中找到对应真实代码或保持一致。
- README 中所有链接有效。

---

# Task 3：移动主教程到 docs/getting-started

## 问题

如果主教程放在 `packages/教程.md`，用户不容易发现。`packages/` 在用户心智中是源码目录，不是文档入口。

## 修改要求

请将现有主教程移动或复制到：

```text
docs/getting-started/quick-start.md
```

如果当前教程是中文，推荐使用：

```text
docs/getting-started/quick-start.zh-CN.md
```

并可新增英文入口：

```text
docs/getting-started/quick-start.md
```

如果暂时只维护中文，也请在 README 明确链接中文文档。

## 建议文档结构

```text
docs/
  getting-started/
    quick-start.md
    quick-start.zh-CN.md
  concepts/
    action.md
    executor.md
    snapshot.md
    resolver.md
    command-envelope.md
  guides/
    vite.md
    nextjs-app-router.md
    react-router.md
    shadcn.md
    server-resolver.md
    voice.md
  troubleshooting/
    error-codes.md
  architecture/
    protocol.md
    runtime.md
    security.md
  release.md
```

本轮不一定要写完所有文档，但至少建立目录和关键入口。

## quick-start 应包含

1. 安装方式。
2. 最小本地命令示例。
3. Action 定义。
4. Executor 绑定。
5. 本地 rule / local resolver。
6. 输入测试命令。
7. 预期结果。
8. 常见错误。
9. 下一步链接。

## 验收标准

- README 链接到新的 Quick Start。
- `packages/教程.md` 不再作为唯一主教程。
- 如果保留 `packages/教程.md`，其顶部必须提示“此文档已迁移”，并链接新位置。
- 新文档路径在 README、packages README 中都有明确入口。

---

# Task 4：以 examples/react-vite-minimal 作为真实示例来源

## 目标

确保 README 和 docs 中的最小接入示例与 `examples/react-vite-minimal` 一致。

## 修改要求

请检查：

```text
examples/react-vite-minimal
README.md
docs/getting-started/quick-start.md
docs/getting-started/quick-start.zh-CN.md
packages/README.md
packages/react/README.md
```

确保以下内容一致：

- import 路径；
- `defineAction` 使用方式；
- `defineMultimodalConfig` 使用方式；
- `useActionExecutor` 返回值；
- `CommandInput` 使用方式；
- `MultimodalProvider` / `MultimodalPage` / `MultimodalGroup` / `MultimodalEntity` 命名；
- 本地规则示例；
- CSS 导入方式；
- 执行结果约定。

## 推荐约束

示例中的 Executor 不应返回 `void`，应返回结构化结果，例如：

```ts
return {
  status: "changed",
};
```

如果当前代码支持更完整类型，请使用当前实际类型。

## 验收标准

- 文档中的最小示例可以复制到 Vite React 项目中运行。
- `examples/react-vite-minimal` 可以独立构建。
- 示例不依赖模型 API Key。
- 示例不依赖 shadcn。
- 示例不依赖 monorepo source alias。
- 示例使用发布包或 package tarball 验证路径。

---

# Task 5：增加 verify:release 脚本

## 问题

当前 `verify` 如果只包含 typecheck/test/build，不足以证明 examples 和发布包可用。

## 修改要求

在根 `package.json` 中新增：

```json
{
  "scripts": {
    "verify:release": "npm run verify && npm run verify:examples && npm run verify:package-consumer"
  }
}
```

如果仓库使用 pnpm，请按现有包管理器风格调整，例如：

```json
{
  "scripts": {
    "verify:release": "pnpm verify && pnpm verify:examples && pnpm verify:package-consumer"
  }
}
```

请以仓库当前脚本风格为准。

## 如果某些脚本不存在

如果以下脚本不存在：

```text
verify:examples
verify:package-consumer
```

请不要直接写一个坏脚本。请补齐或调整为实际存在的验证脚本。

## 验收标准

执行以下命令应成功：

```bash
npm run verify:release
```

或仓库对应包管理器命令：

```bash
pnpm verify:release
```

它至少应覆盖：

```text
typecheck
unit tests
build
examples validation
npm pack / package consumer validation
```

---

# Task 6：新增或完善 GitHub Actions CI

## 目标

让外部贡献者提交 PR 时，能看到自动验证结果。

## 修改要求

如果仓库中没有 `.github/workflows/ci.yml`，请新增。

建议内容：

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  verify:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Verify release
        run: npm run verify:release
```

## 注意

如果仓库使用 pnpm，请使用 pnpm 版本：

```yaml
      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Verify release
        run: pnpm verify:release
```

请根据仓库中实际 lockfile 判断：

```text
pnpm-lock.yaml -> pnpm
package-lock.json -> npm
yarn.lock -> yarn
```

## 验收标准

- `.github/workflows/ci.yml` 存在。
- CI 使用仓库实际包管理器。
- CI 跑 `verify:release`。
- CI 不依赖本地机器环境。
- README 可选加入 CI badge，但不要加入错误 badge。

---

# Task 7：明确 CSS 导入策略

## 背景

如果 `@omni-ui/react` 的 root entry 自动导入 CSS，同时又提供 `@omni-ui/react/styles` 或 `@omni-ui/react/styles.css`，用户会不确定是否还需要手动导入样式。

## 修改要求

请检查：

```text
packages/react/src/index.ts
packages/react/package.json
README.md
docs/getting-started/quick-start.md
examples/react-vite-minimal
```

然后选择一种策略并保持一致。

## 推荐策略：显式导入 CSS

如果不会导致大量破坏，推荐改为显式导入：

```tsx
import "@omni-ui/react/styles.css";
```

也就是：

- `@omni-ui/react` root entry 不自动 import CSS；
- 所有需要默认样式的示例和文档手动导入 CSS；
- `package.json` 保留：

```json
{
  "sideEffects": ["**/*.css"]
}
```

## 备选策略：默认自动导入 CSS

如果当前项目强依赖自动样式导入，暂时保留也可以，但必须在 README 和 docs 中写清楚：

```md
@omni-ui/react imports its base styles by default.
You do not need to import the CSS manually unless you use custom entry points.
```

## 验收标准

- README、Quick Start 和 example 中的 CSS 说明一致。
- package exports 中 CSS 路径真实可用。
- 打包器不会错误裁剪 CSS。
- SSR / server entry 不会意外引入浏览器样式。

---

# Task 8：修复命名与路径残留

## 修改要求

全仓库搜索以下关键词：

```text
apps/docs
docs dev server
启动 docs
教程.md
demo todo
demo-todo
```

重点检查：

```text
README.md
packages/README.md
docs/*
package.json
apps/*
examples/*
```

如果 `apps/docs` 已经改为 `apps/demo-todo`，请同步修改所有文字说明。

## 推荐改法

将：

```md
启动 docs 开发服务器
```

改为：

```md
启动 demo-todo 开发服务器
```

或者：

```md
启动示例应用
```

## 验收标准

- 文档中不再把 demo app 称为 docs app。
- 主教程路径不再只指向 `packages/教程.md`。
- README 中所有目录路径真实存在。
- package scripts 名称与文档描述一致。

---

# Task 9：新增错误码文档骨架

## 目标

降低开发者接入失败时的排障成本。

## 新增文件

```text
docs/troubleshooting/error-codes.md
```

## 建议内容

```md
# Error Codes

OmniUI errors are grouped by runtime stage.

## Snapshot

### OMNI_SNAPSHOT_TOO_LARGE

Meaning:
The generated interaction snapshot exceeded the configured size limit.

Common causes:
- Too many visible entities.
- Large text blocks were included.
- Sensitive fields were not excluded.

How to fix:
- Limit entity scope.
- Mark private fields.
- Add snapshot filters.

## Manifest

### OMNI_ACTION_DUPLICATED

Meaning:
Two actions were registered with the same action id.

How to fix:
Use stable and globally unique action ids such as `todo.complete`.

## Resolution

### OMNI_RESOLUTION_NO_MATCH

Meaning:
No resolver could convert the user input into a valid command.

How to fix:
- Add a local rule.
- Improve action descriptions.
- Check whether the target entity is visible in the snapshot.

## Validation

### OMNI_ARGUMENT_VALIDATION_FAILED

Meaning:
The resolver returned arguments that do not match the action schema.

How to fix:
- Check action input schema.
- Check resolver output.
- Inspect the command in DevTools.

## Execution

### OMNI_EXECUTOR_MISSING

Meaning:
The action exists, but no executor is currently bound.

How to fix:
Call `useActionExecutor` inside the page or feature component that owns the business logic.

### OMNI_EXECUTION_UNVERIFIED

Meaning:
The executor returned `void` or an unstructured result.

How to fix:
Return a structured execution result such as `{ status: "changed" }`.
```

请根据仓库已有错误码调整，不要发明与实际代码完全不一致的错误码。如果代码中已经有错误码定义，请以代码为准。

## 验收标准

- README 或 Quick Start 链接到 error codes 文档。
- 文档中的错误码与当前代码不冲突。
- 每个错误码至少包含 meaning / common causes / how to fix。

---

# Task 10：补充 DevTools 文档入口

## 目标

让用户知道接入失败时可以在哪里看：

```text
Page
Entity
Action
Executor
Resolver
CommandEnvelope
Validation
Policy
ExecutionResult
```

## 新增或修改文件

```text
docs/guides/devtools.md
```

如果已有 devtools 文档，请补充内容，不要重复创建。

## 建议内容

```md
# DevTools

OmniUI DevTools helps you inspect the full command lifecycle.

## What you can inspect

- Current page
- Visible entities
- Registered actions
- Bound executors
- Resolver chain
- Last user input
- Candidate command
- CommandEnvelope
- Validation result
- Policy and confirmation result
- Execution result
- Runtime errors

## Recommended during development

Enable DevTools in local development and staging, but do not expose sensitive snapshot data in production.

## Troubleshooting flow

1. Check whether the Provider is mounted.
2. Check whether the current Page is registered.
3. Check whether entities have stable ids.
4. Check whether the action exists.
5. Check whether the executor is bound.
6. Check whether resolver output matches the action schema.
7. Check whether policy or confirmation rejected the command.
8. Check whether the executor returned a structured result.
```

## 验收标准

- README 的 Documentation 区域链接到 DevTools 文档。
- Quick Start 中说明“如果命令没有执行，请打开 DevTools 或查看 error codes”。
- 不把 DevTools 写成生产必需依赖。

---

# Task 11：补充安全和模型密钥说明

## 背景

OmniUI 涉及 Snapshot、Manifest、LLM Resolver、语音输入等能力。用户需要明确知道哪些数据可能被发送到外部服务，以及模型密钥不能放在浏览器端。

## 新增或修改文件

```text
docs/architecture/security.md
```

或：

```text
docs/guides/server-resolver.md
```

## 必须包含

```md
## Model keys

Do not expose model API keys in browser bundles.

Recommended production setup:

Browser
  -> sends redacted snapshot / manifest summary
  -> your server resolver
  -> model provider
  -> candidate command
  -> browser local validation / policy / executor
```

## 还应说明

- OmniUI 不绕过业务权限；
- Executor 仍由业务项目控制；
- 外部 Resolver 只返回候选命令；
- Command 必须经过本地 schema validation；
- 高风险 Action 应要求用户确认；
- Snapshot 应支持脱敏和裁剪；
- 不应把敏感字段发送给外部模型。

## 验收标准

- README 或 Quick Start 有安全文档入口。
- 文档明确禁止浏览器端暴露模型 API Key。
- 文档明确模型不能直接调用业务代码。

---

# Task 12：完善包职责说明

## 修改文件

```text
packages/README.md
README.md
```

## 建议说明

```md
## Package responsibilities

### @omni-ui/react

Use this for most React apps. It includes React runtime primitives, hooks, command input, and optional development helpers.

### @omni-ui/core

Use this for framework-agnostic protocols, manifests, command envelopes, validation, policies, resolver adapters, or server-side integration.

### @omni-ui/shadcn

This is optional. It provides shadcn/ui-compatible source components or registry recipes. It is not required for OmniUI runtime.
```

如果最终包名改为 `@omni-ui/shadcn-registry`，请全仓库统一修改。

## 验收标准

- 用户能明确知道普通 React 项目只需安装 `@omni-ui/react`。
- 用户不会误以为必须安装 shadcn。
- 用户不会误以为 `@omni-ui/core` 是普通 React 项目的必装包。

---

# Task 13：发布流程文档校准

## 修改文件

```text
docs/release.md
```

## 需要确认

发布流程中应包含：

```text
1. 确认版本状态
2. 运行 verify:release
3. 生成 changeset
4. 构建 package
5. npm pack consumer validation
6. 发布 npm
7. 创建 GitHub Release
8. 更新 CHANGELOG
9. 检查 README badge 和文档版本
```

## 建议加入发布前检查清单

```md
## Pre-release checklist

- [ ] Package versions are aligned.
- [ ] CHANGELOG reflects the release.
- [ ] README installation command is correct.
- [ ] Quick Start works from a clean project.
- [ ] `verify:release` passes.
- [ ] GitHub Actions pass.
- [ ] npm package contents are inspected.
- [ ] GitHub Release notes are prepared.
- [ ] Breaking changes have migration notes.
```

## 验收标准

- 发布文档与实际 scripts 一致。
- 发布文档不引用不存在的命令。
- 发版前检查清单覆盖 README、CHANGELOG、npm pack、example、CI。

---

# Task 14：文档链接完整性检查

## 修改要求

请检查 README 和 docs 中所有相对链接，确保：

- 指向真实存在的文件；
- 不指向已迁移旧路径；
- 不指向空文档；
- 不出现大小写错误；
- 不出现中文文件名迁移后的断链。

可重点搜索：

```text
](docs/
](packages/
](examples/
](apps/
教程.md
quick-start
release
error-codes
devtools
```

## 验收标准

- README 中所有本地链接有效。
- Quick Start 中所有本地链接有效。
- packages README 中所有本地链接有效。
- docs/release.md 中脚本名称有效。

---

# Task 15：最终验证

请在完成修改后运行以下验证。

## 根据仓库包管理器选择

如果是 npm：

```bash
npm install
npm run verify:release
```

如果是 pnpm：

```bash
pnpm install
pnpm verify:release
```

如果 verify:release 太慢，可以至少运行：

```bash
npm run typecheck
npm run test
npm run build
npm run verify:examples
npm run verify:package-consumer
```

或 pnpm 等价命令。

## 还需要手动检查

```text
README.md
docs/getting-started/quick-start.md
docs/troubleshooting/error-codes.md
docs/guides/devtools.md
docs/architecture/security.md
docs/release.md
examples/react-vite-minimal
packages/README.md
packages/react/package.json
packages/core/package.json
.github/workflows/ci.yml
```

## 最终输出给维护者

请在修改完成后总结：

1. 修改了哪些文件；
2. 解决了哪些问题；
3. 哪些检查已经通过；
4. 哪些检查因为环境原因没有运行；
5. 是否还有需要人工确认的发布信息；
6. 是否有 breaking change，例如 CSS 导入策略变化。

---

## 4. 推荐提交拆分

如需拆成多个 commit，建议：

```text
docs: make README consumer-first
docs: move quick start into docs/getting-started
docs: add troubleshooting and security guides
repo: add release verification script
ci: add release verification workflow
docs: align package responsibilities and release process
chore: align changelog and version status
examples: align minimal Vite example with quick start
```

---

## 5. 最终验收标准

本轮修改完成后，应满足：

```text
一个从未接触过 OmniUI 的 React 开发者：
    1. 打开 README；
    2. 知道应该安装 @omni-ui/react；
    3. 知道首次体验不需要 LLM API Key；
    4. 能找到 Quick Start；
    5. 能运行 react-vite-minimal 示例；
    6. 能输入“完成第一个任务”看到页面变化；
    7. 接入失败时能找到 DevTools 和 Error Codes；
    8. 能知道 shadcn 是可选项；
    9. 能知道模型密钥不应暴露在浏览器；
    10. 能看到 CI / verify:release 证明包和示例可用。
```

---

## 6. 备注

本任务的核心不是“让文档更多”，而是“让第一条接入路径更短、更可信、更可验证”。

请优先保证：

```text
README 简洁
Quick Start 可跑
示例真实
版本一致
CI 可验证
发布流程闭环
```

不要为了完整性把所有高级能力都堆到 README。高级能力应进入 docs，README 只负责让开发者愿意开始，并且能成功完成第一条命令。
