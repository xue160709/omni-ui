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

export function defineMultimodalConfig<TConfig extends MultimodalConfig>(
  config: TConfig
): TConfig {
  return config
}

export function normalizeConfiguredRules(
  rules: MultimodalConfig["rules"]
): LocalInteractionRule[] {
  if (!rules) return []
  if (Array.isArray(rules)) return rules
  return rules.rules ?? []
}
