import { afterEach, describe, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEditorKeyboardShortcuts } from "@editor/tools/pdfTextEditor/hooks/useEditorKeyboardShortcuts";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";

function setup() {
  const store = {
    selection: {
      value: { runIds: ["p0-t0"], imageIds: [], shapeIds: [] },
    },
    getState: () => ({ pageCount: 1 }),
  } as unknown as EditorStore;
  const cbs = {
    store,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onSave: vi.fn(),
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
    onSelectAll: vi.fn(),
    onToggleHelp: vi.fn(),
    onOpenFind: vi.fn(),
    onFindNext: vi.fn(),
    onEscape: vi.fn(),
    onMergeSelection: vi.fn(),
  };
  renderHook(() => useEditorKeyboardShortcuts(cbs));
  return cbs;
}

function openModal(): HTMLButtonElement {
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  const button = document.createElement("button");
  dialog.append(button);
  document.body.append(dialog);
  button.focus();
  return button;
}

const press = (key: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key, cancelable: true, ...init }),
  );

afterEach(() => {
  document.body.innerHTML = "";
});

describe("editor shortcuts behind a dialog", () => {
  test("Delete, Escape and undo leave the selection alone while a dialog is open", () => {
    const cbs = setup();
    openModal();
    press("Delete");
    press("Backspace");
    press("Escape");
    press("z", { ctrlKey: true });
    expect(cbs.onDelete).not.toHaveBeenCalled();
    expect(cbs.onEscape).not.toHaveBeenCalled();
    expect(cbs.onUndo).not.toHaveBeenCalled();
  });

  test("help and save still work while a dialog is open", () => {
    const cbs = setup();
    openModal();
    press("?");
    press("s", { ctrlKey: true });
    expect(cbs.onToggleHelp).toHaveBeenCalledTimes(1);
    expect(cbs.onSave).toHaveBeenCalledTimes(1);
  });

  test("Delete reaches the selection once the dialog is gone", () => {
    const cbs = setup();
    press("Delete");
    expect(cbs.onDelete).toHaveBeenCalledTimes(1);
  });
});
