import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDropzoneFiles } from "@app/hooks/useDropzoneFiles";

const { alert } = vi.hoisted(() => ({ alert: vi.fn() }));
vi.mock("@app/components/toast", () => ({ alert }));

describe("drop failure reporting", () => {
  it("reports partial failures outside a modal while retaining readable files", async () => {
    const file = new File(["PDF"], "Readable.pdf");
    const event = Object.assign(new Event("drop"), {
      dataTransfer: {
        items: [
          { kind: "file", getAsFile: () => null },
          { kind: "file", getAsFile: () => file },
        ],
      },
    });
    const { result } = renderHook(() => useDropzoneFiles());

    await expect(result.current(event)).resolves.toEqual([file]);
    expect(alert).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        alertType: "error",
        body: "Could not read a dropped file.",
      }),
    );
  });
});
