import { describe, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEditorClipboard } from "@editor/tools/pdfTextEditor/hooks/useEditorClipboard";

function paste(text: string): void {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { getData: () => text },
  });
  document.body.dispatchEvent(event);
}

function setup(enabled: boolean) {
  const insertPastedText = vi.fn();
  const hook = renderHook(
    ({ on }) =>
      useEditorClipboard({
        enabled: on,
        hasSelection: () => true,
        getSelectedText: () => "picked",
        deleteSelection: vi.fn(),
        insertPastedText,
      }),
    { initialProps: { on: enabled } },
  );
  return { insertPastedText, hook };
}

describe("clipboard while the editor is off screen", () => {
  test("a paste reaches the document while the editor shows", () => {
    const { insertPastedText, hook } = setup(true);
    paste("hello");
    expect(insertPastedText).toHaveBeenCalledWith("hello", false);
    hook.unmount();
  });

  test("a paste in another view leaves the hidden document alone", () => {
    const { insertPastedText, hook } = setup(false);
    paste("hello");
    expect(insertPastedText).not.toHaveBeenCalled();
    hook.unmount();
  });

  test("switching away stops listening, switching back starts again", () => {
    const { insertPastedText, hook } = setup(true);
    hook.rerender({ on: false });
    paste("away");
    expect(insertPastedText).not.toHaveBeenCalled();
    hook.rerender({ on: true });
    paste("back");
    expect(insertPastedText).toHaveBeenCalledWith("back", false);
    hook.unmount();
  });
});
