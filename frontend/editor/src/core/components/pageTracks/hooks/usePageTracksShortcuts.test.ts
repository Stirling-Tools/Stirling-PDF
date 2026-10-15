import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { TrackEditorAction } from "@app/components/pageTracks/trackWorkspaceReducer";
import { usePageTracksShortcuts } from "@app/components/pageTracks/hooks/usePageTracksShortcuts";

function setup(selected: string[]) {
  const dispatch = vi.fn<(action: TrackEditorAction) => void>();
  renderHook(() =>
    usePageTracksShortcuts({ selectedIds: new Set(selected), dispatch }),
  );
  return { dispatch };
}

const press = (
  key: string,
  init: KeyboardEventInit = {},
  target: EventTarget = document.body,
) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
};

describe("usePageTracksShortcuts", () => {
  it("undoes with Ctrl+Z and redoes with Ctrl+Shift+Z or Ctrl+Y", () => {
    const { dispatch } = setup([]);
    press("z", { ctrlKey: true });
    press("Z", { metaKey: true, shiftKey: true });
    press("y", { ctrlKey: true });
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([
      { type: "undo" },
      { type: "redo" },
      { type: "redo" },
    ]);
  });

  it("deletes the selection with Delete or Backspace", () => {
    const { dispatch } = setup(["a2"]);
    press("Delete");
    press("Backspace");
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "delete",
      pageIds: ["a2"],
    });
  });

  it("leaves keys typed into a field or a dialog alone", () => {
    const { dispatch } = setup(["a1"]);
    const input = document.createElement("input");
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const button = document.createElement("button");
    dialog.append(button);
    document.body.append(input, dialog);

    press("Backspace", {}, input);
    press("z", { ctrlKey: true }, button);
    expect(dispatch).not.toHaveBeenCalled();

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    document.body.append(checkbox);
    press("Delete", {}, checkbox);
    expect(dispatch).toHaveBeenCalledWith({ type: "delete", pageIds: ["a1"] });

    input.remove();
    dialog.remove();
    checkbox.remove();
  });
});
