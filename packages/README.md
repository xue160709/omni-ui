# packages/

这个目录包含 Multimodal UI 的三个 npm 包。

## 包列表

| 包 | 目录 | 说明 |
| --- | --- | --- |
| [`@multimodal-ui/react`](./react/) | `packages/react` | React 应用接入多模态能力的主包。Provider、页面/对象标记、route/action 注册、命令输入、assistant 都在这里。大多数 React 项目只需要这一个包。 |
| [`@multimodal-ui/core`](./core/) | `packages/core` | 框架无关的原语层。包含类型、rule resolver、action 校验、LLM resolver helper、assistant prompt 工具。React 项目通常不需要手动安装，已作为 `@multimodal-ui/react` 的依赖自动引入。 |
| [`@multimodal-ui/shadcn`](./shadcn/) | `packages/shadcn` | 可选的 shadcn registry 源码配方。把可编辑的 `components/multimodal/*` wrapper 和 starter recipe 安装到消费方项目里。不是 runtime 必需品。 |

三个包的依赖关系：

```
@multimodal-ui/react
  └── @multimodal-ui/core   (runtime dependency, re-exports common APIs)

@multimodal-ui/shadcn
  └── @multimodal-ui/react  (peer dependency)
```

## 接入指南

如果你是 **应用开发者**，想把 Multimodal UI 接入自己的项目，请看 [教程.md](./教程.md)。

## 本地开发

在 monorepo 根目录运行：

```bash
# 安装所有依赖
npm install

# 启动 docs 开发服务器（registry 本地调试需要）
npm run dev

# 类型检查 + 测试 + runtime build + docs production build
npm run verify

# 仅 registry 相关测试
npm run verify:registry
```

各包的测试和构建命令见各自目录下的 `package.json`。
