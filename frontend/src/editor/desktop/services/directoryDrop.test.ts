import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));

const bridge = {
  postMessageWithAdditionalObjects: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

function dropped(directory = true, count = 1) {
  return {
    files: Array.from(
      { length: count },
      () => new File([], directory ? "Invoices" : "invoice.pdf"),
    ),
    items: [{ webkitGetAsEntry: () => ({ isDirectory: directory }) }],
  } as unknown as DataTransfer;
}

describe("native directory drops", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("chrome", { webview: bridge });
    vi.stubGlobal("crypto", { randomUUID: () => "folder-drop-request" });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("passes the dropped DOM folder to the host and accepts only its matching reply", async () => {
    const { directoryFromDrop } = await import("@app/services/directoryDrop");
    const data = dropped();
    const result = directoryFromDrop(data);
    const [message, objects] =
      bridge.postMessageWithAdditionalObjects.mock.calls[0];
    const request = JSON.parse(message);
    expect(objects).toEqual([data.files[0]]);
    const listener = bridge.addEventListener.mock.calls[0][1];
    listener({
      data: {
        type: "stirling-folder-drop-result",
        requestId: "another-request",
        path: "C:/Wrong",
      },
    });
    expect(bridge.removeEventListener).not.toHaveBeenCalled();
    listener({
      data: {
        type: "stirling-folder-drop-result",
        requestId: request.requestId,
        path: "C:/Invoices",
      },
    });
    await expect(result).resolves.toEqual({
      path: "C:/Invoices",
      name: "Invoices",
    });
    expect(bridge.removeEventListener).toHaveBeenCalledWith(
      "message",
      listener,
    );
  });

  it.each([
    [false, 1],
    [true, 2],
    [true, 0],
  ])(
    "rejects invalid drops before contacting the host (%s, %s)",
    async (directory, count) => {
      const { directoryFromDrop } = await import("@app/services/directoryDrop");
      await expect(
        directoryFromDrop(dropped(directory, count)),
      ).resolves.toBeNull();
      expect(bridge.postMessageWithAdditionalObjects).not.toHaveBeenCalled();
    },
  );

  it("releases the listener if the host cannot resolve the folder", async () => {
    vi.useFakeTimers();
    const { directoryFromDrop } = await import("@app/services/directoryDrop");
    const result = directoryFromDrop(dropped());
    await vi.advanceTimersByTimeAsync(5000);
    await expect(result).resolves.toBeNull();
    expect(bridge.removeEventListener).toHaveBeenCalledOnce();
  });
});
