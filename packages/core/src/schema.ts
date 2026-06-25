// 中文：RuntimeSchema 是 core 的最小参数校验接口，兼容 Zod/Valibot 等 safeParse 风格实现。
// English: RuntimeSchema is core's minimal parameter validation seam for Zod/Valibot-style safeParse adapters.
export type RuntimeSchemaResult<T> =
  | { success: true; data: T }
  | { success: false; error: unknown }

export interface RuntimeSchema<T> {
  safeParse(input: unknown): RuntimeSchemaResult<T>
}

export function isRuntimeSchema<T = unknown>(value: unknown): value is RuntimeSchema<T> {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as RuntimeSchema<T>).safeParse === "function"
  )
}

export function safeParseRuntimeSchema<T>(
  schema: RuntimeSchema<T>,
  input: unknown
): RuntimeSchemaResult<T> {
  try {
    return schema.safeParse(input)
  } catch (error) {
    return {
      success: false,
      error,
    }
  }
}
