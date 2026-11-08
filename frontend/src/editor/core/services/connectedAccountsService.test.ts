import { afterEach, describe, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import type { TFunction } from "i18next";
import {
  connectAccount,
  connectErrorMessage,
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
      undefined,
      { suppressErrorToast: true },
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

function httpError(status: number, data: unknown): AxiosError {
  return new AxiosError(
    `Request failed with status code ${status}`,
    "ERR_BAD_REQUEST",
    undefined,
    undefined,
    {
      status,
      statusText: "",
      data,
      headers: {},
      config: { headers: new AxiosHeaders() },
    },
  );
}

describe("connectErrorMessage", () => {
  const t = ((_key: string, fallback: string) => fallback) as TFunction;

  it("shows the server's reason instead of the HTTP status", () => {
    const error = httpError(409, {
      status: 409,
      title: "Conflict",
      detail: "Google account connections are not set up on this server.",
    });
    expect(connectErrorMessage(error, t)).toBe(
      "Google account connections are not set up on this server.",
    );
  });

  it("falls back to a readable message when the server gives no reason", () => {
    const message = connectErrorMessage(httpError(502, ""), t);
    expect(message).not.toMatch(/status code/);
    expect(message.trim()).not.toBe("");
  });

  it("explains a blocked pop-up", () => {
    expect(connectErrorMessage(new PopupBlockedError(), t)).toMatch(
      /blocked the sign-in window/,
    );
  });
});
