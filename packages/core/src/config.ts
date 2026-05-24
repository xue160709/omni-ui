import type { LocalExecutionPolicy, ModelActionPolicy } from "./assistant"
import type { AppInteractionManifest } from "./manifest"
import type { ConfiguredRuleResolverOptions, LocalInteractionRule } from "./rule-resolver"

export type MultimodalConfig = {
  manifest?: AppInteractionManifest
  rules?: ConfiguredRuleResolverOptions | LocalInteractionRule[]
  llm?: {
    localFastPath?: LocalExecutionPolicy
    modelActionPolicy?: ModelActionPolicy
  }
}

// 中文：保持调用方的字面量类型，方便应用在 config 文件里获得更精确的类型提示。
// English: Preserves caller literal types so app config files keep precise TypeScript hints.
export function defineMultimodalConfig<TConfig extends MultimodalConfig>(
  config: TConfig
): TConfig {
  return config
}

// 中文：兼容简写数组和完整 resolver 配置，统一输出 runtime 可直接消费的规则数组。
// English: Accepts both shorthand arrays and full resolver options, returning rules the runtime can consume directly.
export function normalizeConfiguredRules(
  rules: MultimodalConfig["rules"]
): LocalInteractionRule[] {
  if (!rules) return []
  if (Array.isArray(rules)) return rules
  return rules.rules ?? []
}
