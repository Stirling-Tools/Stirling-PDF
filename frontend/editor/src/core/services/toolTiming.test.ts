import { describe, expect, it } from "vitest";
import {
  emitTiming,
  onTiming,
  parseServerTiming,
  type ToolTiming,
} from "@app/services/toolTiming";

describe("parseServerTiming", () => {
  it("reads the process metric's duration", () => {
    expect(parseServerTiming("process;dur=123.4")).toBe(123.4);
  });

  it("finds the process metric among others", () => {
    expect(
      parseServerTiming('db;dur=5, process;desc="Rust";dur=12.5, cache'),
    ).toBe(12.5);
  });

  it("ignores a metric whose name only starts with process", () => {
    expect(parseServerTiming("processing;dur=9")).toBeNull();
  });

  it("returns null without a usable header", () => {
    expect(parseServerTiming(undefined)).toBeNull();
    expect(parseServerTiming("db;dur=5")).toBeNull();
    expect(parseServerTiming("process")).toBeNull();
  });
});

describe("onTiming", () => {
  it("passes on only the requested tool and implementation's timings", () => {
    const received: ToolTiming[] = [];
    const stopListening = onTiming("adjustColors", "typescript", (timing) =>
      received.push(timing),
    );
    const typescript: ToolTiming = {
      tool: "adjustColors",
      implementation: "typescript",
      location: "browser",
      files: 1,
      totalMs: 5,
      serverProcessingMs: null,
    };

    emitTiming({ ...typescript, implementation: "rust" });
    emitTiming({ ...typescript, tool: "classify" });
    emitTiming(typescript);
    stopListening();
    emitTiming(typescript);

    expect(received).toEqual([typescript]);
  });
});
