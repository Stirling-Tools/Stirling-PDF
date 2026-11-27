import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  focusRunWhenPainted,
  holdKeystrokes,
} from "@editor/tools/pdfTextEditor/util/dom";

const execCommand = vi.fn(() => true);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: execCommand,
  });
  execCommand.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

function runElement(runId: string): HTMLElement {
  const el = document.createElement("div");
  el.dataset.runId = runId;
  el.tabIndex = 0;
  document.body.append(el);
  return el;
}

function press(target: HTMLElement, key: string) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

function frames(count: number) {
  vi.advanceTimersByTime(count * 17);
}

test("a pending focus gives way when the user moves to another run first", () => {
  const source = runElement("source");
  const other = runElement("other");
  source.focus();
  const held = holdKeystrokes();
  focusRunWhenPainted("moved", true, held, undefined, 1);

  frames(2);
  other.focus();
  press(other, "x");
  frames(1);
  const moved = runElement("moved");
  frames(3);

  expect(document.activeElement).toBe(other);
  expect(document.activeElement).not.toBe(moved);
  expect(execCommand).toHaveBeenCalledTimes(1);
  expect(execCommand).toHaveBeenCalledWith("insertText", false, "x");
});

test("keys held for a run that never paints go back into the run they were typed in", () => {
  const source = runElement("source");
  source.focus();
  const held = holdKeystrokes();
  focusRunWhenPainted("never", true, held, undefined, 1);

  press(source, "h");
  press(source, "i");
  frames(200);

  expect(execCommand).toHaveBeenCalledWith("insertText", false, "hi");
});

test("an older pending focus is dropped when a newer one starts", () => {
  const source = runElement("source");
  source.focus();
  focusRunWhenPainted("first", true, holdKeystrokes(), undefined, 1);
  focusRunWhenPainted("second", true, holdKeystrokes(), undefined, 1);
  press(source, "a");
  runElement("first");
  const second = runElement("second");
  frames(3);

  expect(document.activeElement).toBe(second);
  expect(execCommand).toHaveBeenCalledTimes(1);
  expect(execCommand).toHaveBeenCalledWith("insertText", false, "a");
});
