import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import {
  ProcessorChatProvider,
  useChat,
} from "@app/components/chat/ChatContext";

function Probe() {
  const { surface, sendMessage, isOpen, hasUnviewedResult } = useChat();
  return (
    <div>
      <span data-testid="surface">{surface}</span>
      <span data-testid="open">{String(isOpen)}</span>
      <span data-testid="unviewed">{String(hasUnviewedResult)}</span>
      <button type="button" onClick={() => void sendMessage("rotate this")}>
        send
      </button>
    </div>
  );
}

describe("ProcessorChatProvider", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("mounts with no FileContext above it", () => {
    // The portal renders outside AppProviders, so the file hooks would throw here. This is the
    // whole reason the provider takes a bridge rather than calling them itself.
    expect(() =>
      render(
        <ProcessorChatProvider>
          <Probe />
        </ProcessorChatProvider>,
      ),
    ).not.toThrow();
    expect(screen.getByTestId("surface").textContent).toBe("processor");
  });

  it("starts closed with no unviewed result", () => {
    render(
      <ProcessorChatProvider>
        <Probe />
      </ProcessorChatProvider>,
    );
    expect(screen.getByTestId("open").textContent).toBe("false");
    expect(screen.getByTestId("unviewed").textContent).toBe("false");
  });

  it("tells the backend which surface asked", async () => {
    render(
      <ProcessorChatProvider>
        <Probe />
      </ProcessorChatProvider>,
    );
    await act(async () => {
      screen.getByText("send").click();
    });

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalled();
    const body = fetchMock.mock.calls[0][1].body as FormData;
    // Without this the backend defaults to `editor` and document work is allowed through.
    expect(body.get("surface")).toBe("processor");
    expect(body.get("userMessage")).toBe("rotate this");
    // No file layer on this surface, so nothing should be attached.
    expect(body.get("fileInputs[0].fileInput")).toBeNull();
  });
});
