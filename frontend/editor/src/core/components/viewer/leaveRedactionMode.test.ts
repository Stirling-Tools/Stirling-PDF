import { describe, expect, it, vi } from "vitest";
import { leaveRedactionMode } from "@app/components/viewer/leaveRedactionMode";

describe("leaveRedactionMode", () => {
  it("ends redaction when redaction owns the interaction mode", () => {
    const endRedact = vi.fn();
    leaveRedactionMode({ isRedactActive: () => true, endRedact });

    expect(endRedact).toHaveBeenCalledTimes(1);
  });

  it("leaves another mode such as pan alone", () => {
    const endRedact = vi.fn();
    leaveRedactionMode({ isRedactActive: () => false, endRedact });

    expect(endRedact).not.toHaveBeenCalled();
  });

  it("tolerates a missing capability", () => {
    expect(() => leaveRedactionMode(null)).not.toThrow();
    expect(() => leaveRedactionMode(undefined)).not.toThrow();
  });

  it("warns instead of throwing when the document is torn down", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tornDown = () => {
      throw new Error("document gone");
    };

    expect(() =>
      leaveRedactionMode({ isRedactActive: tornDown, endRedact: vi.fn() }),
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});
