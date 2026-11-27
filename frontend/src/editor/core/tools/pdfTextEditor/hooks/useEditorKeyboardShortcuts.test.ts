import { afterEach, describe, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEditorKeyboardShortcuts } from "@editor/tools/pdfTextEditor/hooks/useEditorKeyboardShortcuts";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import { CHANGE_PREVIEW_ATTR } from "@editor/tools/pdfTextEditor/util/dom";

function setup() {
  const store = {
    selection: {
      value: { runIds: ["p0-t0"], imageIds: [], shapeIds: [] },
    },
    getState: () => ({ pageCount: 1 }),
  } as unknown as EditorStore;
  const cbs = {
    store,
    enabled: true,
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
    onToggleUnderline: vi.fn(),
    onSetAlign: vi.fn(),
    onToggleList: vi.fn(),
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

  test("save and undo wait while a change is previewing, then save works again", () => {
    const cbs = setup();
    const preview = openModal().parentElement!;
    preview.setAttribute(CHANGE_PREVIEW_ATTR, "");
    const saving = new KeyboardEvent("keydown", {
      key: "s",
      ctrlKey: true,
      cancelable: true,
    });
    window.dispatchEvent(saving);
    press("z", { ctrlKey: true });
    expect(saving.defaultPrevented).toBe(true);
    expect(cbs.onSave).not.toHaveBeenCalled();
    expect(cbs.onUndo).not.toHaveBeenCalled();

    preview.remove();
    press("s", { ctrlKey: true });
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

describe("writing shortcuts", () => {
  test("Ctrl+U underlines, Ctrl+Shift+L/E/R align and Ctrl+Shift+8/7 make lists", () => {
    const cbs = setup();
    press("u", { ctrlKey: true });
    press("E", { ctrlKey: true, shiftKey: true, code: "KeyE" });
    press("R", { metaKey: true, shiftKey: true, code: "KeyR" });
    press("*", { ctrlKey: true, shiftKey: true, code: "Digit8" });
    press("&", { ctrlKey: true, shiftKey: true, code: "Digit7" });
    expect(cbs.onToggleUnderline).toHaveBeenCalledTimes(1);
    expect(cbs.onSetAlign.mock.calls).toEqual([["center"], ["right"]]);
    expect(cbs.onToggleList.mock.calls).toEqual([["bullet"], ["number"]]);
  });

  test("they leave the browser alone with nothing selected", () => {
    const cbs = setup();
    cbs.store.selection.value.runIds = [];
    const underline = new KeyboardEvent("keydown", {
      key: "u",
      ctrlKey: true,
      cancelable: true,
    });
    window.dispatchEvent(underline);
    expect(underline.defaultPrevented).toBe(false);
    expect(cbs.onToggleUnderline).not.toHaveBeenCalled();
  });

  test("AltGr letters still type: Ctrl+Alt is not a shortcut", () => {
    const cbs = setup();
    const altGrL = new KeyboardEvent("keydown", {
      key: "Ł",
      code: "KeyL",
      ctrlKey: true,
      altKey: true,
      shiftKey: true,
      cancelable: true,
    });
    window.dispatchEvent(altGrL);
    press("u", { ctrlKey: true, altKey: true });
    expect(altGrL.defaultPrevented).toBe(false);
    expect(cbs.onSetAlign).not.toHaveBeenCalled();
    expect(cbs.onToggleUnderline).not.toHaveBeenCalled();
  });
});
