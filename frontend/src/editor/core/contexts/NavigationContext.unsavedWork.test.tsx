import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

vi.mock("@app/contexts/ToolRegistryContext", () => ({
  useToolRegistry: () => ({ allTools: {} }),
}));

import {
  NavigationProvider,
  useNavigation,
} from "@app/contexts/NavigationContext";
import { hasUnsavedWork, __resetUnsavedWork } from "@app/services/unsavedWork";

// The bug this pins: every editor marks itself dirty on NavigationContext, while
// the disk reconciliation read FileContext's own flag - which nothing sets. An
// external edit therefore replaced the bytes under an open editor with no prompt.

let editor: ReturnType<typeof useNavigation>;

function OpenEditor() {
  editor = useNavigation();
  return null;
}

function renderEditor() {
  return render(
    <NavigationProvider>
      <OpenEditor />
    </NavigationProvider>,
  );
}

beforeEach(() => {
  __resetUnsavedWork();
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("the dirty state the disk reconciliation reads", () => {
  it("is clean while no editor has touched anything", () => {
    renderEditor();
    expect(hasUnsavedWork()).toBe(false);
  });

  it("reports edits an editor made but no version has captured", () => {
    renderEditor();
    act(() => editor.setHasUnsavedChanges(true));
    expect(hasUnsavedWork()).toBe(true);
  });

  it("reports edits held only by a registered checker", () => {
    // How PageEditor and FormFill answer: their dirty state lives in their own
    // undo stack, and never reaches the reducer until navigation asks.
    renderEditor();
    act(() => editor.registerUnsavedChangesChecker(() => true));
    expect(hasUnsavedWork()).toBe(true);
  });

  it("is clean again once the editor commits or closes", () => {
    renderEditor();
    act(() => editor.setHasUnsavedChanges(true));
    act(() => editor.setHasUnsavedChanges(false));
    expect(hasUnsavedWork()).toBe(false);
  });

  it("is clean once the provider unmounts", () => {
    const view = renderEditor();
    act(() => editor.setHasUnsavedChanges(true));
    view.unmount();
    expect(hasUnsavedWork()).toBe(false);
  });
});
