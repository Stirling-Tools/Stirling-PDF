import { describe, expect, test } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAutomationForm } from "@editor/hooks/tools/automate/useAutomationForm";
import {
  AutomationMode,
  type AutomationConfig,
} from "@editor/types/automation";
import type { ToolRegistry } from "@editor/data/toolsTaxonomy";

const registry = {
  rotate: {
    name: "Rotate",
    operationConfig: {
      defaultParameters: { angle: 0 },
      validateParams: (p: { angle: number }) => p.angle % 90 === 0,
    },
  },
  compress: {
    name: "Compress",
    operationConfig: { defaultParameters: { compressionLevel: 5 } },
  },
  sanitize: {
    name: "Sanitize",
    automationSettings: () => null,
    operationConfig: { defaultParameters: { removeJavaScript: true } },
  },
} as unknown as Partial<ToolRegistry>;

const existing: AutomationConfig = {
  id: "a1",
  name: "Invoice cleanup",
  icon: "CompressIcon",
  operations: [
    { operation: "rotate", parameters: { angle: 90 } },
    { operation: "compress", parameters: {} },
  ],
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

function create() {
  return renderHook(() =>
    useAutomationForm({ mode: AutomationMode.CREATE, toolRegistry: registry }),
  );
}

describe("useAutomationForm", () => {
  test("a new automation starts with one empty step", () => {
    const { result } = create();
    expect(result.current.steps).toHaveLength(1);
    expect(result.current.steps[0].operation).toBe("");
  });

  test("one configured step is enough to save, and empty slots are dropped", () => {
    const { result } = create();
    act(() => result.current.setAutomationName("Shrink"));
    act(() => result.current.setStepTool(0, "compress"));
    act(() => {
      result.current.addStep();
    });
    expect(result.current.saveBlocker).toBeNull();
    expect(result.current.buildAutomationData().operations).toEqual([
      { operation: "compress", parameters: { compressionLevel: 5 } },
    ]);
  });

  test("a step whose tool was cleared blocks saving until it is replaced", () => {
    const { result } = create();
    act(() => result.current.setAutomationName("Shrink"));
    act(() => result.current.setStepTool(0, "compress"));
    act(() => {
      result.current.addStep();
    });
    act(() => result.current.setStepTool(1, "rotate"));
    act(() => result.current.clearStepTool(0));
    expect(result.current.saveBlocker).toEqual({
      kind: "stepNoTool",
      index: 0,
    });
    act(() => result.current.setStepTool(0, "compress"));
    expect(result.current.saveBlocker).toBeNull();
  });

  test("names a lone cleared step rather than asking for a step", () => {
    const { result } = create();
    act(() => result.current.setAutomationName("Shrink"));
    act(() => result.current.setStepTool(0, "compress"));
    act(() => result.current.clearStepTool(0));
    expect(result.current.saveBlocker).toEqual({
      kind: "stepNoTool",
      index: 0,
    });
  });

  test("registry defaults count as configured", () => {
    const { result } = create();
    act(() => result.current.setAutomationName("Turn"));
    act(() => result.current.setStepTool(0, "rotate"));
    expect(result.current.saveBlocker).toBeNull();
  });

  test("a tool with settings whose defaults are valid needs no configuring", () => {
    const { result } = create();
    act(() => result.current.setAutomationName("Clean"));
    act(() => result.current.setStepTool(0, "sanitize"));
    expect(result.current.saveBlocker).toBeNull();
  });

  test("a step whose saved settings fail the tool's check blocks saving", () => {
    const invalid: AutomationConfig = {
      ...existing,
      operations: [{ operation: "rotate", parameters: { angle: 45 } }],
    };
    for (const mode of [AutomationMode.SUGGESTED, AutomationMode.EDIT]) {
      const { result } = renderHook(() =>
        useAutomationForm({
          mode,
          existingAutomation: invalid,
          toolRegistry: registry,
        }),
      );
      expect(result.current.saveBlocker).toEqual({
        kind: "stepNeedsConfiguration",
        index: 0,
      });
    }
  });

  test("a validator that throws on a stored value counts as needing configuration", () => {
    const throwing = {
      ...registry,
      rotate: {
        name: "Rotate",
        operationConfig: {
          defaultParameters: { angle: 0 },
          validateParams: (p: { angle: number }) => p.angle.toFixed(0) !== "",
        },
      },
    } as unknown as Partial<ToolRegistry>;
    const { result } = renderHook(() =>
      useAutomationForm({
        mode: AutomationMode.EDIT,
        existingAutomation: {
          ...existing,
          operations: [{ operation: "rotate", parameters: { angle: null } }],
        },
        toolRegistry: throwing,
      }),
    );
    expect(result.current.saveBlocker).toEqual({
      kind: "stepNeedsConfiguration",
      index: 0,
    });
  });

  test("names the first problem that blocks saving", () => {
    const { result } = create();
    expect(result.current.saveBlocker).toEqual({ kind: "name" });
    act(() => result.current.setAutomationName("Turn"));
    expect(result.current.saveBlocker).toEqual({ kind: "noSteps" });
    act(() => result.current.setStepTool(0, "rotate"));
    act(() => result.current.setStepParameter(0, "angle", 45));
    expect(result.current.saveBlocker).toEqual({
      kind: "stepNeedsConfiguration",
      index: 0,
    });
  });

  test("any step can be removed, including the first", () => {
    const { result } = renderHook(() =>
      useAutomationForm({
        mode: AutomationMode.EDIT,
        existingAutomation: existing,
        toolRegistry: registry,
      }),
    );
    act(() => result.current.removeStep(0));
    expect(result.current.steps.map((s) => s.operation)).toEqual(["compress"]);
    act(() => result.current.removeStep(0));
    expect(result.current.steps).toHaveLength(0);
  });

  test("steps can be reordered", () => {
    const { result } = renderHook(() =>
      useAutomationForm({
        mode: AutomationMode.EDIT,
        existingAutomation: existing,
        toolRegistry: registry,
      }),
    );
    act(() => result.current.moveStep(0, 1));
    expect(result.current.steps.map((s) => s.operation)).toEqual([
      "compress",
      "rotate",
    ]);
    act(() => result.current.moveStep(0, -1));
    expect(result.current.steps.map((s) => s.operation)).toEqual([
      "compress",
      "rotate",
    ]);
  });

  test("is dirty only once something differs from what was loaded", () => {
    const { result } = renderHook(() =>
      useAutomationForm({
        mode: AutomationMode.EDIT,
        existingAutomation: existing,
        toolRegistry: registry,
      }),
    );
    expect(result.current.isDirty).toBe(false);
    act(() => result.current.setAutomationName("Invoice cleanup v2"));
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.setAutomationName("Invoice cleanup"));
    expect(result.current.isDirty).toBe(false);
  });
});
