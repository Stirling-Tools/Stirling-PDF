import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { ToolCategoryId } from "@app/data/toolsTaxonomy";

const handleToolSelect = vi.hoisted(() => vi.fn());
vi.mock("@app/contexts/ToolWorkflowContext", () => ({
  useToolWorkflow: () => ({
    // A recommended tool gets the first default binding: Ctrl+Alt+1 off a Mac.
    toolRegistry: { merge: { categoryId: ToolCategoryId.RECOMMENDED_TOOLS } },
    handleToolSelect,
  }),
}));

import { HotkeyProvider } from "@app/contexts/HotkeyContext";

function pressFirstToolKey() {
  fireEvent.keyDown(window, {
    code: "Digit1",
    key: "1",
    altKey: true,
    ctrlKey: true,
  });
}

beforeEach(() => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
  handleToolSelect.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

it("opens a tool from its hotkey in the editor", () => {
  render(<HotkeyProvider>{null}</HotkeyProvider>);
  pressFirstToolKey();
  expect(handleToolSelect).toHaveBeenCalledWith("merge");
});

it("stays out of the Processor, where desktop keeps the editor mounted underneath", () => {
  window.history.replaceState({}, "", "/processor/pipelines");
  render(<HotkeyProvider>{null}</HotkeyProvider>);
  pressFirstToolKey();
  expect(handleToolSelect).not.toHaveBeenCalled();
});
