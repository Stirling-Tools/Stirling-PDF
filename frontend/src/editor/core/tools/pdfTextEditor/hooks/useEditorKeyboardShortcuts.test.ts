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
    onToggleBold: vi.fn(),
    onToggleItalic: vi.fn(),
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

describe("help while editing text", () => {
  // jsdom has no isContentEditable; the editor treats a focused text field the same way.
  function focusText(): HTMLTextAreaElement {
    const field = document.createElement("textarea");
    document.body.append(field);
    field.focus();
    return field;
  }

  test("F1 opens the help with the caret in a line of text", () => {
    const cbs = setup();
    focusText();
    press("F1");
    expect(cbs.onToggleHelp).toHaveBeenCalledTimes(1);
  });

  test("? still types into the line instead of opening the help", () => {
    const cbs = setup();
    focusText();
    press("?");
    expect(cbs.onToggleHelp).not.toHaveBeenCalled();
  });
});

describe("Bold and Italic", () => {
  test("Ctrl+B and Ctrl+I restyle the selection, typing in a run included", () => {
    const cbs = setup();
    const run = document.createElement("div");
    run.contentEditable = "true";
    document.body.append(run);
    run.focus();
    const bold = new KeyboardEvent("keydown", {
      key: "b",
      ctrlKey: true,
      cancelable: true,
    });
    window.dispatchEvent(bold);
    press("I", { metaKey: true, shiftKey: true });
    expect(cbs.onToggleBold).toHaveBeenCalledTimes(1);
    expect(cbs.onToggleItalic).toHaveBeenCalledTimes(1);
    expect(bold.defaultPrevented).toBe(true);
  });

  test("a field keeps Ctrl+B for itself", () => {
    const cbs = setup();
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    press("b", { ctrlKey: true });
    expect(cbs.onToggleBold).not.toHaveBeenCalled();
  });
});
