import {
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
