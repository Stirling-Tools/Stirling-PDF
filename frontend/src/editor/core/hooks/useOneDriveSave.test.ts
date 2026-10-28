import { act, renderHook } from "@testing-library/react";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, expect, it, vi } from "vitest";
import {
  CONNECTED_ACCOUNTS_SETTINGS_PATH,
  useOneDriveSave,
} from "@editor/hooks/useOneDriveSave";
import { OneDriveSaveError } from "@editor/services/oneDriveSave";
import type { StirlingFileStub } from "@editor/types/fileContext";
import type { CloudOrigin, FileId } from "@editor/types/file";

const mocks = vi.hoisted(() => ({
  alert: vi.fn((_options: Record<string, unknown>) => "toast-1"),
  navigate: vi.fn(),
  save: vi.fn(),
  openExternal: vi.fn(),
  pickFolder: vi.fn(),
  account: { id: 9, personal: false } as
    | { id: number; personal: boolean }
    | undefined,
}));

vi.mock("@editor/components/toast", () => ({
  alert: mocks.alert,
  dismissToast: vi.fn(),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@editor/contexts/FileContext", () => ({
  useFileActions: () => ({ actions: { updateStirlingFileStub: vi.fn() } }),
}));
vi.mock("@editor/hooks/useConnectedAccounts", () => ({
  useConnectedAccounts: () => ({ available: () => true, connect: vi.fn() }),
  ensureConnectedAccount: async () => ({ account: mocks.account }),
}));
vi.mock("@editor/hooks/useOneDrivePicker", () => ({
  useOneDrivePicker: () => ({ isEnabled: true }),
}));
vi.mock("@editor/services/fileStorage", () => ({
  fileStorage: {
    getStirlingFile: async () => new File(["%PDF"], "Report.pdf"),
    updateFileMetadata: async () => true,
  },
}));
vi.mock("@editor/services/oneDriveSave", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@editor/services/oneDriveSave")>()),
  saveToOneDrive: mocks.save,
}));
vi.mock("@editor/services/oneDrivePickerService", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@editor/services/oneDrivePickerService")
  >()),
  getOneDrivePickerService: () => ({ pickFolder: mocks.pickFolder }),
}));
vi.mock("@editor/platform/openExternal", () => ({
  openExternal: mocks.openExternal,
}));

const origin: CloudOrigin = {
  provider: "onedrive",
  accountId: 9,
  driveId: "drive-1",
  itemId: "item-1",
  parentId: "folder-1",
  name: "Report.pdf",
  eTag: '"{E},1"',
  webUrl: "https://contoso.sharepoint.com/Report.pdf",
};

const stub = {
  id: "file-1" as FileId,
  name: "Report.pdf",
  cloudOrigin: origin,
} as StirlingFileStub;

function lastToast(): Record<string, unknown> {
  return mocks.alert.mock.calls.at(-1)![0];
}

beforeEach(() => {
  mocks.alert.mockClear();
  mocks.navigate.mockReset();
  mocks.save.mockReset();
  mocks.openExternal.mockReset();
  mocks.pickFolder.mockReset();
  mocks.account = { id: 9, personal: false };
});

it("offers a Reconnect button that opens the connected accounts settings", async () => {
  mocks.save.mockRejectedValue(new OneDriveSaveError("reconnect", "sign in"));
  const { result } = renderHook(useOneDriveSave);

  await act(() => result.current.save(stub));

  const toast = lastToast();
  expect(toast.body).toBe("provider.onedrive.errors.reconnect");
  expect(toast.buttonText).toBe("oneDriveSave.reconnect");
  (toast.buttonCallback as () => void)();
  expect(mocks.navigate).toHaveBeenCalledWith(CONNECTED_ACCOUNTS_SETTINGS_PATH);
});

it("words a server failure differently from a lost connection", async () => {
  mocks.save
    .mockRejectedValueOnce(new OneDriveSaveError("network", "offline"))
    .mockRejectedValueOnce(new OneDriveSaveError("server", "500"));
  const { result } = renderHook(useOneDriveSave);

  await act(() => result.current.save(stub));
  expect(lastToast().body).toBe("provider.onedrive.errors.unreachable");
  expect(lastToast().buttonText).toBeUndefined();

  await act(() => result.current.save(stub));
  expect(lastToast().body).toBe("provider.onedrive.errors.serverError");
});

it("offers Reconnect when the folder picker's token is refused", async () => {
  mocks.pickFolder.mockRejectedValue(
    new AxiosError("refused", "ERR", undefined, undefined, {
      status: 409,
      statusText: "Conflict",
      data: {},
      headers: {},
      config: { headers: new AxiosHeaders() },
    }),
  );
  const { result } = renderHook(useOneDriveSave);

  await act(() => result.current.saveToFolder(stub));

  expect(lastToast().body).toBe("provider.onedrive.errors.reconnect");
  expect(lastToast().buttonText).toBe("oneDriveSave.reconnect");
  expect(mocks.save).not.toHaveBeenCalled();
});

it("opens the file's OneDrive page when it has one", () => {
  const { result } = renderHook(useOneDriveSave);

  act(() => result.current.openInOneDrive(stub));
  expect(mocks.openExternal).toHaveBeenCalledWith(origin.webUrl);

  mocks.openExternal.mockClear();
  act(() =>
    result.current.openInOneDrive({
      ...stub,
      cloudOrigin: { ...origin, webUrl: null },
    }),
  );
  expect(mocks.openExternal).not.toHaveBeenCalled();
});
