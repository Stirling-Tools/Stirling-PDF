import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useSaveStoredFile } from "@editor/hooks/useSaveStoredFile";
import type { SaveTarget } from "@editor/services/saveTargets";
import type { StirlingFileStub } from "@editor/types/fileContext";
import type { FileId } from "@editor/types/file";

const mocks = vi.hoisted(() => ({
  alert: vi.fn(),
  download: vi.fn(),
  updateStub: vi.fn(),
  enforce: vi.fn(async (files: File[]) => files),
  targets: [] as SaveTarget[],
  saveMode: { mode: "replace", locked: false, setMode: vi.fn() } as {
    mode: string;
    locked: boolean;
    setMode: ReturnType<typeof vi.fn>;
  },
  taken: new Set<string>(),
  askChoice: vi.fn(),
}));

vi.mock("@editor/components/toast", () => ({ alert: mocks.alert }));
vi.mock("@editor/contexts/FileContext", () => ({
  useFileActions: () => ({
    actions: { updateStirlingFileStub: mocks.updateStub },
  }),
}));
vi.mock("@editor/hooks/useSaveTargets", () => ({
  useSaveTargets: () => mocks.targets,
}));
vi.mock("@editor/services/downloadService", () => ({
  downloadFile: mocks.download,
}));
vi.mock("@editor/services/fileStorage", () => ({
  fileStorage: { getStirlingFile: async () => null },
}));
vi.mock("@editor/services/policyExport", () => ({
  enforceExportPolicies: mocks.enforce,
}));
vi.mock("@editor/hooks/useSaveMode", () => ({
  useSaveMode: () => mocks.saveMode,
}));
vi.mock("@editor/hooks/useFileActionIcons", () => ({
  useFileActionIcons: () => ({ download: "save", saveAs: "save-all" }),
}));
vi.mock("@editor/services/desktopFileLink", () => ({
  getDiskFileState: async (path: string) =>
    mocks.taken.has(path)
      ? { availability: "present", size: 1, modifiedMs: 1 }
      : { availability: "gone" },
}));
vi.mock("@editor/services/saveChoice", () => ({
  requestSaveChoice: mocks.askChoice,
}));

const pdf = () => new File(["%PDF"], "old-name.pdf");
const stub = (extra: Partial<StirlingFileStub> = {}): StirlingFileStub =>
  ({ id: "f1" as FileId, name: "Report.pdf", ...extra }) as StirlingFileStub;

function target(save: SaveTarget["save"]): SaveTarget {
  return {
    id: "cloud",
    handles: (s) => s.id === ("f1" as FileId),
    isUnsaved: () => true,
    saveLabel: () => "Update in cloud",
    homeName: () => "the cloud",
    saveAllLabel: () => "Save all to cloud",
    statusLabel: () => "Not in cloud",
    icon: "cloud-upload",
    save,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.targets = [];
  mocks.saveMode = { mode: "replace", locked: false, setMode: vi.fn() };
  mocks.taken = new Set();
  mocks.download.mockResolvedValue({ savedPath: "C:/docs/Report.pdf" });
});

it("saves a disk file in place and marks it clean", async () => {
  const { result } = renderHook(() => useSaveStoredFile());
  const file = pdf();
  const outcome = await result.current.saveStoredFile(
    stub({ localFilePath: "C:/docs/Report.pdf", isDirty: true }),
    file,
  );
  expect(outcome).toBe("saved");
  expect(mocks.enforce).toHaveBeenCalledWith([file], ["f1"]);
  expect(mocks.download).toHaveBeenCalledWith(
    expect.objectContaining({
      filename: "Report.pdf",
      localPath: "C:/docs/Report.pdf",
    }),
  );
  expect(mocks.updateStub).toHaveBeenCalledWith("f1", {
    localFilePath: "C:/docs/Report.pdf",
    isDirty: false,
  });
});

it("a local copy never changes the file's disk link", async () => {
  const { result } = renderHook(() => useSaveStoredFile());
  await result.current.saveLocalCopy(
    stub({ localFilePath: "C:/docs/Report.pdf" }),
    pdf(),
  );
  expect(mocks.download).toHaveBeenCalledWith(
    expect.objectContaining({ localPath: undefined }),
  );
  expect(mocks.updateStub).not.toHaveBeenCalled();
});

it("sends a handled file to its target instead of downloading", async () => {
  const save = vi.fn(async () => "saved" as const);
  mocks.targets = [target(save)];
  const { result } = renderHook(() => useSaveStoredFile());
  expect(await result.current.saveStoredFile(stub(), pdf())).toBe("saved");
  expect(save).toHaveBeenCalled();
  expect(mocks.download).not.toHaveBeenCalled();
});

it("falls back to the built-in save when the target hands it back", async () => {
  mocks.targets = [target(async () => "fallback")];
  const { result } = renderHook(() => useSaveStoredFile());
  expect(await result.current.saveStoredFile(stub(), pdf())).toBe("saved");
  expect(mocks.download).toHaveBeenCalledWith(
    expect.objectContaining({ localPath: undefined }),
  );
});

it("reports a cancelled Save As", async () => {
  mocks.download.mockResolvedValue({ cancelled: true });
  const { result } = renderHook(() => useSaveStoredFile());
  expect(await result.current.saveStoredFile(stub(), pdf())).toBe("cancelled");
});

it("reports a missing file instead of saving nothing", async () => {
  const { result } = renderHook(() => useSaveStoredFile());
  expect(await result.current.saveStoredFile(stub())).toBe("failed");
  expect(mocks.alert).toHaveBeenCalledWith(
    expect.objectContaining({ alertType: "error" }),
  );
});

it("counts unsaved disk edits and asks the target for its own files", () => {
  const { result, rerender } = renderHook(() => useSaveStoredFile());
  expect(
    result.current.isUnsaved(stub({ isDirty: true, localFilePath: "C:/a" })),
  ).toBe(true);
  expect(result.current.isUnsaved(stub({ isDirty: true }))).toBe(false);
  mocks.targets = [target(async () => "saved")];
  rerender();
  expect(result.current.isUnsaved(stub())).toBe(true);
});

it("with Save a copy, writes the first free name beside a disk file and keeps it", async () => {
  mocks.saveMode.mode = "copy";
  mocks.taken = new Set(["C:/docs/Report (edited).pdf"]);
  const { result } = renderHook(() => useSaveStoredFile());
  const outcome = await result.current.saveStoredFile(
    stub({ localFilePath: "C:/docs/Report.pdf", isDirty: true }),
    pdf(),
  );
  expect(outcome).toBe("saved");
  expect(mocks.download).toHaveBeenCalledWith(
    expect.objectContaining({ localPath: "C:/docs/Report (edited 2).pdf" }),
  );
  expect(mocks.updateStub).toHaveBeenCalledWith("f1", {
    name: "Report (edited 2).pdf",
    localFilePath: "C:/docs/Report (edited 2).pdf",
    localFileIsCopy: true,
    isDirty: false,
  });
});

it("keeps updating a copy Stirling made, whatever the setting", async () => {
  mocks.saveMode.mode = "copy";
  const { result } = renderHook(() => useSaveStoredFile());
  await result.current.saveStoredFile(
    stub({
      localFilePath: "C:/docs/Report (edited).pdf",
      localFileIsCopy: true,
    }),
    pdf(),
  );
  expect(mocks.download).toHaveBeenCalledWith(
    expect.objectContaining({ localPath: "C:/docs/Report (edited).pdf" }),
  );
});

it("asks, and remembers the choice when told to", async () => {
  mocks.saveMode.mode = "ask";
  mocks.askChoice.mockResolvedValue({ choice: "replace", remember: true });
  const { result } = renderHook(() => useSaveStoredFile());
  await result.current.saveStoredFile(
    stub({ localFilePath: "C:/docs/Report.pdf" }),
    pdf(),
  );
  expect(mocks.askChoice).toHaveBeenCalledWith(
    expect.objectContaining({
      fileName: "Report.pdf",
      copyName: "Report (edited).pdf",
      otherLabel: "saveFile.menu.saveCopyElsewhere",
      canRemember: true,
    }),
  );
  expect(mocks.saveMode.setMode).toHaveBeenCalledWith("replace");
  expect(mocks.download).toHaveBeenCalledWith(
    expect.objectContaining({ localPath: "C:/docs/Report.pdf" }),
  );
});

it("a dismissed ask saves nothing", async () => {
  mocks.saveMode.mode = "ask";
  mocks.askChoice.mockResolvedValue(null);
  const { result } = renderHook(() => useSaveStoredFile());
  expect(
    await result.current.saveStoredFile(
      stub({ localFilePath: "C:/docs/Report.pdf" }),
      pdf(),
    ),
  ).toBe("cancelled");
  expect(mocks.download).not.toHaveBeenCalled();
});

it("tells the target which way to save", async () => {
  mocks.saveMode.mode = "copy";
  const save = vi.fn(async () => "saved" as const);
  mocks.targets = [target(save)];
  const { result } = renderHook(() => useSaveStoredFile());
  await result.current.saveStoredFile(stub(), pdf());
  expect(save).toHaveBeenCalledWith(
    expect.anything(),
    expect.any(File),
    "copy",
  );
});

it("does not run export policies twice when the caller already did", async () => {
  const { result } = renderHook(() => useSaveStoredFile());
  await result.current.saveStoredFile(
    stub({ localFilePath: "C:/docs/Report.pdf" }),
    pdf(),
    { policiesApplied: true },
  );
  expect(mocks.enforce).not.toHaveBeenCalled();
});
