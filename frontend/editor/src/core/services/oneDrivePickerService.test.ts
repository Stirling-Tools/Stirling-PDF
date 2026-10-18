import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptToExtensions,
  getOneDriveConfig,
  getOneDrivePickerService,
} from "@app/services/oneDrivePickerService";

const msal = vi.hoisted(() => {
  class InteractionRequiredAuthError extends Error {}
  const account = {
    homeAccountId: "a",
    tenantId: "tenant-guid",
    username: "pat@contoso.com",
  };
  const app = {
    getActiveAccount: vi.fn(() => account),
    getAllAccounts: vi.fn(() => [account]),
    setActiveAccount: vi.fn(),
    loginPopup: vi.fn(),
    acquireTokenSilent: vi.fn(async ({ scopes }: { scopes: string[] }) => ({
      accessToken: `token:${scopes.join(" ")}`,
    })),
    acquireTokenPopup: vi.fn(),
    clearCache: vi.fn(),
  };
  return { InteractionRequiredAuthError, app, account };
});
const serverTokens = vi.hoisted(() => ({
  fetchAccessToken: vi.fn(
    async (_id: number, resource: string) => `server:${resource}`,
  ),
}));
vi.mock("@app/services/connectedAccountsService", () => serverTokens);
vi.mock("@azure/msal-browser", () => ({
  InteractionRequiredAuthError: msal.InteractionRequiredAuthError,
  createStandardPublicClientApplication: vi.fn(async () => msal.app),
}));

describe("config helpers", () => {
  it("needs the switch and a client id", () => {
    expect(getOneDriveConfig({ microsoftEnabled: true })).toBeNull();
    expect(getOneDriveConfig({ microsoftClientId: "id" })).toBeNull();
    expect(
      getOneDriveConfig({ microsoftEnabled: true, microsoftClientId: "id" }),
    ).toEqual({
      clientId: "id",
      tenant: "common",
      graphUrl: "https://graph.microsoft.com/v1.0",
    });
  });

  it("keeps only extensions from an accept string", () => {
    expect(acceptToExtensions(".PDF, image/*,application/pdf,.docx")).toEqual([
      ".pdf",
      ".docx",
    ]);
    expect(acceptToExtensions(undefined)).toEqual([]);
  });
});

describe("picker protocol", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/me/drive?$select=webUrl")) {
        return Response.json({
          webUrl: "https://contoso-my.sharepoint.com/personal/pat/Documents",
        });
      }
      if (url.includes("/drives/drive%201/items/item-1?")) {
        expect(init?.headers).toEqual({
          Authorization: "Bearer token:Files.Read.All",
        });
        return Response.json({
          name: "Invoice.pdf",
          file: { mimeType: "application/pdf" },
          lastModifiedDateTime: "2026-10-01T10:00:00Z",
          "@microsoft.graph.downloadUrl": "https://download.example/invoice",
        });
      }
      if (url === "https://download.example/invoice") {
        expect(init).toBeUndefined();
        return new Response("%PDF-1.7");
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  /** Plays the picker's side of the channel once its iframe exists. */
  async function connectPicker(): Promise<{
    send: (id: string, data: unknown) => void;
    replies: unknown[];
  }> {
    await vi.waitFor(() =>
      expect(
        document.querySelector("[data-testid=onedrive-picker]"),
      ).not.toBeNull(),
    );
    const frame = document.querySelector("iframe")!;
    const form = HTMLFormElement.prototype.submit as unknown as {
      mock: { contexts: HTMLFormElement[] };
    };
    const submitted = form.mock.contexts[0];
    expect(submitted.action).toMatch(
      /^https:\/\/contoso-my\.sharepoint\.com\/_layouts\/15\/FilePicker\.aspx\?/,
    );
    const options = JSON.parse(
      new URL(submitted.action).searchParams.get("filePicker")!,
    );
    const channel = new MessageChannel();
    const replies: unknown[] = [];
    channel.port2.onmessage = (event) => replies.push(event.data);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "initialize", channelId: options.messaging.channelId },
        source: frame.contentWindow,
        ports: [channel.port1],
      }),
    );
    await vi.waitFor(() =>
      expect(replies).toContainEqual({ type: "activate" }),
    );
    return {
      replies,
      send: (id, data) =>
        channel.port2.postMessage({ type: "command", id, data }),
    };
  }

  it("answers token requests and downloads the picked files", async () => {
    const service = getOneDrivePickerService();
    await service.initialize({
      clientId: "app-id",
      tenant: "common",
      graphUrl: "https://graph.microsoft.com/v1.0",
    });
    const picked = service.pick({ extensions: [".pdf"] });

    const picker = await connectPicker();
    picker.send("1", {
      command: "authenticate",
      resource: "https://contoso-my.sharepoint.com",
      type: "SharePoint",
    });
    await vi.waitFor(() =>
      expect(picker.replies).toContainEqual({
        type: "result",
        id: "1",
        data: {
          result: "token",
          token: "token:https://contoso-my.sharepoint.com/.default",
        },
      }),
    );
    picker.send("2", {
      command: "pick",
      items: [
        {
          id: "item-1",
          name: "Invoice.pdf",
          parentReference: { driveId: "drive 1" },
        },
      ],
    });

    const files = await picked;
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("Invoice.pdf");
    expect(files[0].type).toBe("application/pdf");
    expect(files[0].lastModified).toBe(Date.parse("2026-10-01T10:00:00Z"));
    expect(document.querySelector("[data-testid=onedrive-picker]")).toBeNull();
  });

  it("resolves to nothing when the picker is closed", async () => {
    const service = getOneDrivePickerService();
    await service.initialize({
      clientId: "app-id",
      tenant: "common",
      graphUrl: "https://graph.microsoft.com/v1.0",
    });
    const picked = service.pick();

    const picker = await connectPicker();
    picker.send("1", { command: "close" });

    expect(await picked).toEqual([]);
    expect(document.querySelector("[data-testid=onedrive-picker]")).toBeNull();
  });

  it("uses a connected account's server-issued tokens without signing in here", async () => {
    msal.app.loginPopup.mockClear();
    msal.app.acquireTokenSilent.mockClear();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/me/drive?$select=webUrl")) {
        expect(init?.headers).toEqual({ Authorization: "Bearer server:graph" });
        return Response.json({
          webUrl: "https://contoso-my.sharepoint.com/personal/pat/Documents",
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const service = getOneDrivePickerService();
    await service.initialize({
      clientId: "app-id",
      tenant: "common",
      graphUrl: "https://graph.microsoft.com/v1.0",
    });
    const picked = service.pick({}, { accountId: 3 });

    const picker = await connectPicker();
    picker.send("1", {
      command: "authenticate",
      resource: "https://contoso-my.sharepoint.com/personal/pat",
    });
    await vi.waitFor(() =>
      expect(picker.replies).toContainEqual({
        type: "result",
        id: "1",
        data: {
          result: "token",
          token: "server:https://contoso-my.sharepoint.com",
        },
      }),
    );
    picker.send("2", { command: "close" });

    expect(await picked).toEqual([]);
    expect(msal.app.loginPopup).not.toHaveBeenCalled();
    expect(msal.app.acquireTokenSilent).not.toHaveBeenCalled();
    expect(serverTokens.fetchAccessToken).toHaveBeenCalledWith(3, "graph");
  });
});
