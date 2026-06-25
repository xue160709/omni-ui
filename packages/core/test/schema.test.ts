import { describe, expect, it } from "vitest"
import { isRuntimeSchema, safeParseRuntimeSchema, type RuntimeSchema } from "../src"

describe("runtime schema", () => {
  it("accepts safeParse-compatible schema adapters without adding a core dependency", () => {
    const schema: RuntimeSchema<{ todoId: string }> = {
      safeParse(input) {
        const value = input as Record<string, unknown>
        return typeof value.todoId === "string"
          ? { success: true, data: { todoId: value.todoId } }
          : { success: false, error: "todoId must be a string" }
      },
    }

    expect(isRuntimeSchema(schema)).toBe(true)
    expect(safeParseRuntimeSchema(schema, { todoId: "todo_1" })).toEqual({
      success: true,
      data: { todoId: "todo_1" },
    })
    expect(safeParseRuntimeSchema(schema, { todoId: 123 })).toMatchObject({
      success: false,
    })
  })
})
