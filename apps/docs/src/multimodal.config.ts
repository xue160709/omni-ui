import {
  NAVIGATION_BACK_ACTION_ID,
  NAVIGATION_FORWARD_ACTION_ID,
  NAVIGATION_GOTO_ACTION_ID,
  defineMultimodalConfig,
  type LocalExecutionPolicy,
  type ModelActionPolicy,
} from "@multimodal-ui/react"

export const assistantLocalFastPathPolicy = {
  mode: "allowlist",
  minConfidence: 0.7,
  allowDomainActions: true,
  allowPrimitiveActions: false,
  actionIds: ["navigation.*"],
} satisfies LocalExecutionPolicy

export const assistantModelActionPolicy = {
  mode: "allowlist",
  minConfidence: 0.7,
  allowDomainActions: true,
  allowPrimitiveActions: false,
  actionIds: [
    "navigation.*",
    "todo.add",
    "todo.complete",
    "todo.uncomplete",
    "todo.update",
    "todo.filter",
    "todo.delete",
    "todo.clearCompleted",
  ],
  requireConfirmationForRisk: ["medium", "high"],
} satisfies ModelActionPolicy

export const multimodalConfig = defineMultimodalConfig({
  rules: [
    {
      id: "navigation.back",
      patterns: ["返回上一页", "回上一页", "回到上一页", "后退", "返回上页"],
      target: "page.current",
      actionId: NAVIGATION_BACK_ACTION_ID,
    },
    {
      id: "navigation.forward",
      patterns: ["前进", "下一页", "前进下一页", "去下一页", "回到下一页"],
      target: "page.current",
      actionId: NAVIGATION_FORWARD_ACTION_ID,
    },
    {
      id: "navigation.goto",
      patterns: ["打开{route}", "去{route}", "进入{route}", "回到{route}"],
      target: "route.byLabel",
      actionId: NAVIGATION_GOTO_ACTION_ID,
    },
  ],
  llm: {
    localFastPath: assistantLocalFastPathPolicy,
    modelActionPolicy: assistantModelActionPolicy,
  },
})
