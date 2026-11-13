import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri: () => true }));

import {
  captureDropDiagnostics,
  folderOf,
} from "@editor/services/dropDiagnostics";

let stop: () => void;

function fire(type: string, files: File[] = []) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      types: ["Files"],
      items: files.map((file) => ({ kind: "file", type: file.type })),
      files,
    },
  });
  document.dispatchEvent(event);
}

const logged = () =>
  invoke.mock.calls.map(
    (call) => (call as unknown[])[1] as { message: string },
  );

beforeEach(() => {
  vi.useFakeTimers();
  invoke.mockClear();
  stop = captureDropDiagnostics();
});

afterEach(() => {
  stop();
  vi.useRealTimers();
});

describe("drop diagnostics", () => {
  it("logs a drag once on entry and again on drop, without file names", () => {
    const file = new File(["%PDF"], "Schuldner Akte.pdf", {
      type: "application/pdf",
    });
    fire("dragenter");
    fire("dragover");
    fire("dragover");
    fire("drop", [file]);

    const messages = logged().map(({ message }) => message);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatch(/^drag entered: types \[Files\]/);
    expect(messages[1]).toMatch(/^drop \d+ ms after the last dragover/);
    expect(messages[1]).toContain(".pdf 4 B");
    expect(messages.join()).not.toContain("Schuldner");
  });

  it("logs a drag that goes quiet without a drop", () => {
    fire("dragenter");
    fire("dragover");
    vi.advanceTimersByTime(2000);

    expect(logged().at(-1)?.message).toMatch(/^no dragover for 1500 ms/);
  });

  it("logs the next drag after one that left before any dragover", () => {
    fire("dragenter");
    vi.advanceTimersByTime(2000);
    fire("dragenter");

    const messages = logged().map(({ message }) => message);
    expect(messages).toHaveLength(3);
    expect(messages[1]).toMatch(/^no dragover for 1500 ms/);
    expect(messages[2]).toMatch(/^drag entered/);
  });

  it("ignores drags that start inside the page", () => {
    fire("dragstart");
    fire("dragenter");
    fire("dragover");
    fire("drop");
    fire("dragend");

    expect(invoke).not.toHaveBeenCalled();
  });

  it("stops logging once cleaned up", () => {
    stop();
    fire("dragenter");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("reduces a path to its folder", () => {
    expect(folderOf("C:\\Users\\x\\AppData\\Local\\Temp\\a.pdf")).toBe(
      "C:\\Users\\x\\AppData\\Local\\Temp",
    );
    expect(folderOf(null)).toBe("no path");
  });
});
