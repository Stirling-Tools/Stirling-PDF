import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useSaveButton } from "@editor/components/shared/workbenchBar/useSaveButton";
import type { SaveStoredFile } from "@editor/hooks/useSaveStoredFile";
import type { SaveTarget } from "@editor/services/saveTargets";
import type { StirlingFileStub } from "@editor/types/fileContext";
import type { FileId } from "@editor/types/file";

const disk = vi.hoisted(() => ({ saves: false }));

vi.mock("@editor/services/downloadService", () => ({
  get SAVES_TO_DISK() {
    return disk.saves;
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}));

const stub = (id: string, extra: Partial<StirlingFileStub> = {}) =>
  ({ id: id as FileId, name: `${id}.pdf`, ...extra }) as StirlingFileStub;

const cloud: SaveTarget = {
  id: "cloud",
  handles: (s) => s.id.startsWith("c"),
  isUnsaved: () => true,
  saveLabel: (s) => `Update ${s.name} in cloud`,
  saveAllLabel: () => "Save all to cloud",
  statusLabel: () => "Not in cloud",
  icon: "cloud-upload",
  save: async () => "saved",
  menuItems: () => [
    {
      key: "copy",
      label: "Save a copy to cloud",
      icon: "copy",
      onClick: vi.fn(),
    },
  ],
};

function saver(targets: SaveTarget[]): SaveStoredFile {
  const targetFor = (s: StirlingFileStub) => targets.find((t) => t.handles(s));
  return {
    targetFor,
    isUnsaved: (s) =>
      targetFor(s)?.isUnsaved(s) ?? Boolean(s.isDirty && s.localFilePath),
    saveStoredFile: async () => "saved",
    saveLocalCopy: async () => "saved",
  };
}

beforeEach(() => {
  disk.saves = false;
});

const base = {
  singleFile: true,
  onSaveLocalCopy: vi.fn(),
  fileFor: async () => undefined,
};

it("leaves the browser toolbar alone when nothing has a save target", () => {
  const { result } = renderHook(() =>
    useSaveButton({
      ...base,
      saver: saver([]),
      targets: [stub("a")],
    }),
  );
  expect(result.current).toEqual({
    label: undefined,
    icon: undefined,
    unsaved: false,
  });
});

it("moves desktop Save As into the menu and dots unsaved disk edits", () => {
  disk.saves = true;
  const { result } = renderHook(() =>
    useSaveButton({
      ...base,
      saver: saver([]),
      targets: [stub("a", { isDirty: true, localFilePath: "C:/a.pdf" })],
    }),
  );
  expect(result.current.unsaved).toBe(true);
  expect(result.current.menu?.map((item) => item.label)).toEqual([
    "Save a copy...",
  ]);
});

it("names the target and lists its destinations for one file", () => {
  const { result } = renderHook(() =>
    useSaveButton({
      ...base,
      saver: saver([cloud]),
      targets: [stub("c1")],
    }),
  );
  expect(result.current.label).toBe("Update c1.pdf in cloud");
  expect(result.current.icon).toBe("cloud-upload");
  expect(result.current.menu?.map((item) => item.label)).toEqual([
    "Download",
    "Save a copy to cloud",
  ]);
});

it("says each file goes home when targets are mixed", () => {
  const { result } = renderHook(() =>
    useSaveButton({
      ...base,
      singleFile: false,
      saver: saver([cloud]),
      targets: [stub("c1"), stub("a")],
    }),
  );
  expect(result.current.label).toBe("Save all");
  expect(result.current.icon).toBeUndefined();
  expect(result.current.menu).toBeUndefined();
});
