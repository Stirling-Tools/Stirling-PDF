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
  config: {} as Record<string, unknown>,
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
  useConnectedAccounts: () => ({
    available: () => true,
    connect: vi.fn(),
    accounts: [{ id: 9, provider: "microsoft", status: "CONNECTED" }],
    accountFor: () => mocks.account,
  }),
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
vi.mock("@editor/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: mocks.config }),
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
  mocks.config = { microsoftEnabled: true, microsoftClientId: "client" };
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

it.each([
  ["network", "unreachable"],
  ["server", "serverError"],
] as const)("words a %s failure as %s", async (code, message) => {
  mocks.save.mockRejectedValue(new OneDriveSaveError(code, code));
  const { result } = renderHook(useOneDriveSave);

  await act(() => result.current.save(stub));

  expect(lastToast().body).toBe(`provider.onedrive.errors.${message}`);
  expect(lastToast().buttonText).toBeUndefined();
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

it("is a save target for files opened from OneDrive", () => {
  const { result } = renderHook(useOneDriveSave);
  const target = result.current.target!;
  expect(target.handles(stub)).toBe(true);
  expect(target.handles({ ...stub, cloudOrigin: undefined })).toBe(false);
  expect(target.saveLabel(stub, "replace")).toBe(
    "oneDriveSave.toolbar.replace",
  );
  expect(
    target.isUnsaved({
      ...stub,
      cloudOrigin: { ...origin, savedFileId: "file-0" },
    }),
  ).toBe(true);
  expect(
    target.isUnsaved({
      ...stub,
      cloudOrigin: { ...origin, savedFileId: "file-1" },
    }),
  ).toBe(false);
});

it("keeps updating a copy Stirling made, whatever the setting", () => {
  const { result } = renderHook(useOneDriveSave);
  const target = result.current.target!;
  const copy = { ...stub, cloudOrigin: { ...origin, stirlingCopy: true } };
  expect(target.plan!(copy, "copy")).toBe("replace");
  expect(target.plan!(stub, "copy")).toBe("copy");
});

it("saves a copy next to the original when asked to", async () => {
  mocks.save.mockResolvedValue({
    ...origin,
    itemId: "item-2",
    name: "Report (edited).pdf",
  });
  const { result } = renderHook(useOneDriveSave);
  const outcome = await act(() =>
    result.current.target!.save(stub, new File(["%PDF"], "Report.pdf"), "copy"),
  );
  expect(outcome).toBe("saved");
  expect(mocks.save).toHaveBeenCalledWith(
    expect.any(File),
    expect.objectContaining({ kind: "copy", name: "Report (edited).pdf" }),
  );
});

it("is not a save target when the admin turns off editor saves", () => {
  mocks.config = { ...mocks.config, microsoftAllowEditorSaves: false };
  const { result } = renderHook(useOneDriveSave);
  expect(result.current.target).toBeNull();
  expect(result.current.available).toBe(false);
});

it.each([
  ["a work or school account", { id: 9, personal: false }, true],
  ["a personal account", { id: 9, personal: true }, false],
  ["no connected account", undefined, false],
])("offers a folder save only with %s", (_name, account, offered) => {
  mocks.account = account;
  const { result } = renderHook(useOneDriveSave);
  const keys = result.current.target!.menuItems!(
    stub,
    async () => undefined,
  ).map((item) => item.key);
  expect(result.current.canSaveToFolder).toBe(offered);
  expect(keys).toEqual(offered ? ["folder"] : []);
});
