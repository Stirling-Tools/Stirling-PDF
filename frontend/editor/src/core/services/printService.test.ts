import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { printPdfBlob } from "@app/services/printService";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

const frames = () => [...document.querySelectorAll("iframe")];

/**
 * Stands in for the frame's window so the test can see the handoff. `print`
 * runs the afterprint listener the service put there before calling it, which
 * is how a real blocking preview reports itself closed.
 */
const stubContentWindow = (frame: HTMLIFrameElement) => {
  let afterprint: (() => void) | null = null;
  const contentWindow = {
    focus: vi.fn(),
    print: vi.fn(() => afterprint?.()),
    addEventListener: vi.fn((type: string, listener: () => void) => {
      if (type === "afterprint") {
        afterprint = listener;
      }
    }),
  };
  Object.defineProperty(frame, "contentWindow", {
    value: contentWindow,
    configurable: true,
  });
  return contentWindow;
};

describe("printPdfBlob", () => {
  beforeEach(() => {
    let sequence = 0;
    URL.createObjectURL = vi.fn(() => `blob:print-${++sequence}`);
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.useRealTimers();
  });

  it("never prints a job cancelled while its document was loading", async () => {
    const controller = new AbortController();
    const printed = printPdfBlob(
      new Blob(["%PDF"]),
      "job.pdf",
      controller.signal,
    );
    const frame = frames()[0];
    const contentWindow = stubContentWindow(frame);

    controller.abort();
    frame.dispatchEvent(new Event("load"));

    await expect(printed).rejects.toMatchObject({ name: "AbortError" });
    expect(contentWindow.print).not.toHaveBeenCalled();
    expect(frames()).toHaveLength(0);
  });

  it("releases the frame when the preview closes inside print()", async () => {
    const printed = printPdfBlob(new Blob(["%PDF"]), "job.pdf");
    const frame = frames()[0];
    const contentWindow = stubContentWindow(frame);

    frame.dispatchEvent(new Event("load"));

    await expect(printed).resolves.toBeUndefined();
    expect(contentWindow.print).toHaveBeenCalledTimes(1);
    expect(frames()).toHaveLength(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:print-1");
  });

  it("rejects an already-aborted signal without creating a frame", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      printPdfBlob(new Blob(["%PDF"]), "job.pdf", controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(frames()).toHaveLength(0);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("gives up when the frame never finishes loading", async () => {
    vi.useFakeTimers();
    const printed = printPdfBlob(new Blob(["%PDF"]), "job.pdf");
    // Attach before the timer fires, so the rejection is never unhandled.
    const rejected = expect(printed).rejects.toThrow(
      "The print frame did not load",
    );

    await vi.advanceTimersByTimeAsync(15_000);

    await rejected;
    expect(frames()).toHaveLength(0);
  });

  it("supersedes the previous print and revokes its URL", async () => {
    vi.useFakeTimers();
    const first = printPdfBlob(new Blob(["%PDF"]), "one.pdf");
    const firstFrame = frames()[0];
    const firstSettled = first.catch(() => {});

    const second = printPdfBlob(new Blob(["%PDF"]), "two.pdf");
    const secondFrame = frames()[0];
    const secondSettled = second.catch(() => {});

    expect(firstFrame.isConnected).toBe(false);
    expect(secondFrame.isConnected).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:print-1");

    // The superseded job's load timeout still fires; drain it so no timer
    // outlives the test.
    await vi.advanceTimersByTimeAsync(15_000);
    await Promise.all([firstSettled, secondSettled]);
  });

  it("releases the frame when the document fails to load", async () => {
    const printed = printPdfBlob(new Blob(["%PDF"]), "job.pdf");
    const frame = frames()[0];
    const rejected = expect(printed).rejects.toThrow(
      "Failed to load the print frame",
    );

    frame.dispatchEvent(new Event("error"));

    await rejected;
    expect(frames()).toHaveLength(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:print-1");
  });

  it("leaves a newer job's frame alone when an older job is cancelled", async () => {
    const olderSignal = new AbortController();
    const newerSignal = new AbortController();
    const older = printPdfBlob(
      new Blob(["%PDF"]),
      "one.pdf",
      olderSignal.signal,
    );
    const rejected = expect(older).rejects.toMatchObject({
      name: "AbortError",
    });

    // Starting a print supersedes the one before it: the module owns one frame,
    // and the cancelled job's cleanup must not reach past its own.
    const newer = printPdfBlob(
      new Blob(["%PDF"]),
      "two.pdf",
      newerSignal.signal,
    );
    const frame = frames()[0];
    const contentWindow = stubContentWindow(frame);

    olderSignal.abort();
    await rejected;

    expect(frames()).toHaveLength(1);
    expect(frame.isConnected).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:print-1");
    // The cancelled job released its own URL; the newer job's bytes stay.
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith("blob:print-2");

    frame.dispatchEvent(new Event("load"));

    await expect(newer).resolves.toBeUndefined();
    expect(contentWindow.print).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:print-2");
  });
});
