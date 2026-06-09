import { describe, expect, test } from "vitest";
import {
  REENTER_REQUIRED_VALUE,
  isSensitiveParameterKey,
  serializeWorkflowParameters,
} from "@app/utils/workflowRecorderSerializer";

describe("workflowRecorderSerializer", () => {
  test("keeps JSON-safe parameters", () => {
    const result = serializeWorkflowParameters({
      angle: 90,
      includeMetadata: false,
      labels: ["a", "b"],
      nested: { mode: "fast" },
    });

    expect(result).toEqual({
      parameters: {
        angle: 90,
        includeMetadata: false,
        labels: ["a", "b"],
        nested: { mode: "fast" },
      },
      hasSensitiveFields: false,
      hasNonSerializableFields: false,
    });
  });

  test.each([
    "password",
    "certificatePassword",
    "apiKey",
    "private_key",
    "secretToken",
  ])("detects sensitive key %s", (key) => {
    expect(isSensitiveParameterKey(key)).toBe(true);
  });

  test("redacts sensitive values and marks the result", () => {
    const result = serializeWorkflowParameters({
      password: "do-not-store",
      nested: {
        apiKey: "also-secret",
      },
    });

    expect(result.parameters).toEqual({
      password: REENTER_REQUIRED_VALUE,
      nested: {
        apiKey: REENTER_REQUIRED_VALUE,
      },
    });
    expect(result.hasSensitiveFields).toBe(true);
    expect(result.hasNonSerializableFields).toBe(false);
  });

  test("drops non-serializable values and marks the result", () => {
    const result = serializeWorkflowParameters({
      keep: "yes",
      file: new File(["data"], "input.pdf", { type: "application/pdf" }),
      callback: () => undefined,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(result.parameters).toEqual({ keep: "yes" });
    expect(result.hasSensitiveFields).toBe(false);
    expect(result.hasNonSerializableFields).toBe(true);
  });

  test("handles circular objects without throwing", () => {
    const circular: Record<string, unknown> = { keep: true };
    circular.self = circular;

    const result = serializeWorkflowParameters(circular);

    expect(result.parameters).toEqual({ keep: true });
    expect(result.hasNonSerializableFields).toBe(true);
  });

  test("rejects non-object root parameters", () => {
    const result = serializeWorkflowParameters("not an object");

    expect(result.parameters).toEqual({});
    expect(result.hasSensitiveFields).toBe(false);
    expect(result.hasNonSerializableFields).toBe(true);
  });
});
