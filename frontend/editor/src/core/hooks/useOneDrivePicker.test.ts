import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useOneDrivePicker } from "@app/hooks/useOneDrivePicker";
import { allowConsole } from "@app/tests/failOnConsole";

const service = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  pick: vi.fn(),
}));
const appConfig = vi.hoisted(() => ({
  config: {
    microsoftEnabled: true,
    microsoftClientId: "app-id",
    microsoftTenant: "organizations",
  } as Record<string, unknown>,
}));
const accounts = vi.hoisted(() => ({
  available: false,
  account: undefined as { id: number; personal: boolean } | undefined,
  connect: vi.fn(),
}));
vi.mock("@app/hooks/useConnectedAccounts", () => ({
  useConnectedAccounts: () => ({
    available: () => accounts.available,
    connect: accounts.connect,
  }),
  ensureConnectedAccount: async (
    provider: string,
    connect: (provider: string) => Promise<string>,
  ) => {
    if (accounts.account) return { account: accounts.account };
    const outcome = await connect(provider);
    return { account: accounts.account, outcome };
  },
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => appConfig,
}));
vi.mock("@app/services/oneDrivePickerService", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@app/services/oneDrivePickerService")
  >()),
  getOneDrivePickerService: () => service,
}));

beforeEach(() => {
  service.initialize.mockClear();
  service.pick.mockReset();
  accounts.available = false;
  accounts.account = undefined;
  accounts.connect.mockReset();
});

it("prepares sign-in as soon as the server enables OneDrive", () => {
  const { result } = renderHook(useOneDrivePicker);
  expect(result.current.isEnabled).toBe(true);
  expect(service.initialize).toHaveBeenCalledWith({
    clientId: "app-id",
    tenant: "organizations",
    graphUrl: "https://graph.microsoft.com/v1.0",
  });
});

it("narrows the picker to the accepted extensions", async () => {
  const file = new File(["PDF"], "Report.pdf");
  service.pick.mockResolvedValue([file]);
  const { result } = renderHook(useOneDrivePicker);

  await act(async () => {
    expect(
      await result.current.openPicker({
        multiple: false,
        accept: ".pdf,application/pdf,image/*",
      }),
    ).toEqual([file]);
  });

  expect(service.pick).toHaveBeenCalledWith(
    expect.objectContaining({ multiple: false, extensions: [".pdf"] }),
    undefined,
  );
});

it("reports a failed pick and recovers on retry", async () => {
  allowConsole.error(/OneDrive picker error/);
  service.pick
    .mockRejectedValueOnce(new Error("AADSTS65001: consent required"))
    .mockResolvedValueOnce([]);
  const { result } = renderHook(useOneDrivePicker);

  await act(async () => {
    expect(await result.current.openPicker()).toEqual([]);
  });
  expect(result.current.error).toBe("AADSTS65001: consent required");

  act(() => result.current.clearError());
  await act(async () => {
    await result.current.openPicker();
  });
  expect(result.current.error).toBeNull();
  expect(result.current.isLoading).toBe(false);
});

it("explains a blocked sign-in window and stays quiet when the user closes it", async () => {
  allowConsole.error(/OneDrive picker error/);
  service.pick
    .mockRejectedValueOnce(
      Object.assign(new Error("popup_window_error: see docs"), {
        errorCode: "popup_window_error",
      }),
    )
    .mockRejectedValueOnce(
      Object.assign(new Error("user_cancelled"), {
        errorCode: "user_cancelled",
      }),
    );
  const { result } = renderHook(useOneDrivePicker);

  await act(async () => {
    await result.current.openPicker();
  });
  expect(result.current.error).toBe("provider.onedrive.errors.popupBlocked");

  act(() => result.current.clearError());
  await act(async () => {
    expect(await result.current.openPicker()).toEqual([]);
  });
  expect(result.current.error).toBeNull();
});

it("connects the Microsoft account on first use, then picks with it", async () => {
  accounts.available = true;
  accounts.connect.mockImplementation(async () => {
    accounts.account = { id: 4, personal: false };
    return "connected";
  });
  service.pick.mockResolvedValue([]);
  const { result } = renderHook(useOneDrivePicker);

  await act(async () => {
    await result.current.openPicker();
  });

  expect(accounts.connect).toHaveBeenCalledWith("microsoft");
  expect(service.pick).toHaveBeenCalledWith(expect.anything(), {
    accountId: 4,
  });
});

it("signs a personal account in through the browser instead", async () => {
  accounts.available = true;
  accounts.account = { id: 4, personal: true };
  service.pick.mockResolvedValue([]);
  const { result } = renderHook(useOneDrivePicker);

  await act(async () => {
    await result.current.openPicker();
  });

  expect(accounts.connect).not.toHaveBeenCalled();
  expect(service.pick).toHaveBeenCalledWith(expect.anything(), undefined);
});

it("stops quietly when the user closes the connect window", async () => {
  accounts.available = true;
  accounts.connect.mockResolvedValue("closed");
  const { result } = renderHook(useOneDrivePicker);

  await act(async () => {
    expect(await result.current.openPicker()).toEqual([]);
  });

  expect(service.pick).not.toHaveBeenCalled();
  expect(result.current.error).toBeNull();
});
