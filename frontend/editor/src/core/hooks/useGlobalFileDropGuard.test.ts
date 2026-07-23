import { afterEach, describe, expect, test } from "vitest";
import {
  installFileDropGuard,
  isExternalFileDrag,
} from "@app/hooks/useGlobalFileDropGuard";

/**
 * jsdom does not implement a full DragEvent/DataTransfer, so we dispatch a
 * plain cancelable Event with a stubbed `dataTransfer.types` and read
 * `defaultPrevented` to observe whether the guard cancelled the default
 * navigation. This keeps the tests hermetic and framework-free.
 */
function dispatchDrag(
  type: "dragover" | "drop",
  types: string[] | undefined,
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    configurable: true,
    value: types === undefined ? null : { types },
  });
  window.dispatchEvent(event);
  return event;
}

describe("isExternalFileDrag", () => {
  test("is true when the drag carries files", () => {
    const event = new Event("drop") as DragEvent;
    Object.defineProperty(event, "dataTransfer", {
      value: { types: ["Files"] },
    });
    expect(isExternalFileDrag(event)).toBe(true);
  });

  test("is false for an internal (non-file) drag", () => {
    const event = new Event("drop") as DragEvent;
    Object.defineProperty(event, "dataTransfer", {
      value: { types: ["text/plain"] },
    });
    expect(isExternalFileDrag(event)).toBe(false);
  });

  test("is false when dataTransfer is absent", () => {
    const event = new Event("drop") as DragEvent;
    Object.defineProperty(event, "dataTransfer", { value: null });
    expect(isExternalFileDrag(event)).toBe(false);
  });
});

describe("installFileDropGuard", () => {
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  test("prevents default for an external file drop", () => {
    dispose = installFileDropGuard(window);
    const event = dispatchDrag("drop", ["Files"]);
    expect(event.defaultPrevented).toBe(true);
  });

  test("prevents default for an external file dragover", () => {
    dispose = installFileDropGuard(window);
    const event = dispatchDrag("dragover", ["Files"]);
    expect(event.defaultPrevented).toBe(true);
  });

  test("does not prevent default for an internal drag", () => {
    dispose = installFileDropGuard(window);
    const event = dispatchDrag("drop", ["text/plain"]);
    expect(event.defaultPrevented).toBe(false);
  });

  test("removes its listeners when disposed", () => {
    installFileDropGuard(window)();
    const event = dispatchDrag("drop", ["Files"]);
    expect(event.defaultPrevented).toBe(false);
  });
});
