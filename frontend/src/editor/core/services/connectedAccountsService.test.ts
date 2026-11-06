import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectAccount,
  PopupBlockedError,
} from "@editor/services/connectedAccountsService";

const api = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@editor/services/apiClient", () => ({ default: api }));

function fakePopup() {
  return { closed: false, close: vi.fn(), location: { href: "" } };
}

describe("connectAccount", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    api.post.mockReset();
  });

  it("opens the window before asking the server, then sends it to the provider", async () => {
    const popup = fakePopup();
    const order: string[] = [];
    vi.spyOn(window, "open").mockImplementation(() => {
      order.push("open");
      return popup as unknown as Window;
    });
    api.post.mockImplementation(async () => {
      order.push("post");
      return {
        data: { authorizationUrl: "https://login.example/authorize?x=1" },
      };
    });

    const outcome = connectAccount("microsoft");
    await vi.waitFor(() =>
      expect(popup.location.href).toBe("https://login.example/authorize?x=1"),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { source: "stirling-connected-account", status: "connected" },
        source: popup as unknown as Window,
      }),
    );

    expect(await outcome).toBe("connected");
    expect(order).toEqual(["open", "post"]);
    expect(api.post).toHaveBeenCalledWith(
      "/api/v1/connected-accounts/microsoft/connect",
    );
  });

  it("ignores messages from other windows and reports a closed window", async () => {
    const popup = fakePopup();
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    api.post.mockResolvedValue({ data: { authorizationUrl: "https://x" } });

    const outcome = connectAccount("google");
    await vi.waitFor(() => expect(popup.location.href).toBe("https://x"));
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { source: "stirling-connected-account", status: "connected" },
      }),
    );
    popup.closed = true;

    expect(await outcome).toBe("closed");
  });

  it("fails clearly when the browser blocks the window", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    await expect(connectAccount("google")).rejects.toBeInstanceOf(
      PopupBlockedError,
    );
    expect(api.post).not.toHaveBeenCalled();
  });
});
