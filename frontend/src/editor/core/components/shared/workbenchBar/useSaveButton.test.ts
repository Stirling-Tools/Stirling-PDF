import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useSaveButton } from "@editor/components/shared/workbenchBar/useSaveButton";
import type { SaveStoredFile } from "@editor/hooks/useSaveStoredFile";
import type { SaveTarget } from "@editor/services/saveTargets";
import type { SaveMode } from "@editor/services/saveMode";
import type { StirlingFileStub } from "@editor/types/fileContext";
import type { FileId } from "@editor/types/file";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, vars?: Record<string, string>) =>
      fallback.replace(/{{(\w+)}}/g, (_m, k: string) => vars?.[k] ?? ""),
  }),
}));

const stub = (id: string, extra: Partial<StirlingFileStub> = {}) =>
  ({ id: id as FileId, name: `${id}.pdf`, ...extra }) as StirlingFileStub;

const cloud: SaveTarget = {
  id: "cloud",
  handles: (s) => s.id.startsWith("c"),
  isUnsaved: () => true,
  saveLabel: (s) => `Update ${s.name} in cloud`,
  homeName: () => "the cloud",
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

function saver(
  targets: SaveTarget[],
  mode: SaveMode = "replace",
): SaveStoredFile {
  const targetFor = (s: StirlingFileStub) => targets.find((t) => t.handles(s));
  return {
    targetFor,
    planFor: (s) => (targetFor(s) || s.localFilePath ? mode : null),
    targetSaveLabel: (s) => targetFor(s)?.saveLabel(s, mode),
    saveToHome: async () => "saved",
    isUnsaved: (s) =>
      targetFor(s)?.isUnsaved(s) ?? Boolean(s.isDirty && s.localFilePath),
    saveStoredFile: async () => "saved",
    saveLocalCopy: async () => "saved",
  };
}

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
      savesToDisk: false,
    }),
  );
  expect(result.current).toEqual({
    label: "Download",
    icon: undefined,
    unsaved: false,
  });
});

it("moves desktop Save As into the menu and dots unsaved disk edits", () => {
  const { result } = renderHook(() =>
    useSaveButton({
      ...base,
      saver: saver([]),
      targets: [stub("a", { isDirty: true, localFilePath: "C:/a.pdf" })],
      savesToDisk: true,
    }),
  );
  expect(result.current.unsaved).toBe(true);
  expect(result.current.menu?.map((item) => item.label)).toEqual([
    "Save a copy somewhere else…",
    "Save a copy next to it",
  ]);
});

it("names the target and lists its destinations for one file", () => {
  const { result } = renderHook(() =>
    useSaveButton({
      ...base,
      saver: saver([cloud]),
      targets: [stub("c1")],
      savesToDisk: false,
    }),
  );
  expect(result.current.label).toBe("Update c1.pdf in cloud");
  expect(result.current.icon).toBe("cloud-upload");
  expect(result.current.menu?.map((item) => item.label)).toEqual([
    "Download a copy",
    "Save a copy next to it",
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
      savesToDisk: false,
    }),
  );
  expect(result.current.label).toBe(
    "Save all, each back to where it came from",
  );
  expect(result.current.icon).toBeUndefined();
  expect(result.current.menu).toBeUndefined();
});

it("names the copy and offers the update when the setting is Save a copy", () => {
  const { result } = renderHook(() =>
    useSaveButton({
      ...base,
      saver: saver([], "copy"),
      targets: [stub("a", { localFilePath: "C:/a.pdf" })],
      savesToDisk: true,
    }),
  );
  expect(result.current.label).toBe("Save a copy of a.pdf next to it");
  expect(result.current.menu?.map((item) => item.label)).toEqual([
    "Save a copy somewhere else…",
    "Update a.pdf",
  ]);
});

it("names the save mode for the only file in a list view", () => {
  const { result } = renderHook(() =>
    useSaveButton({
      ...base,
      singleFile: false,
      saver: saver([], "ask"),
      targets: [stub("a", { localFilePath: "C:/a.pdf" })],
      savesToDisk: true,
    }),
  );
  expect(result.current.label).toBe("Save a.pdf…");
  expect(result.current.menu?.map((item) => item.label)).toEqual([
    "Save a copy somewhere else…",
  ]);
});

it("uses the single-file label for the only file in Update the original mode", () => {
  const { result } = renderHook(() =>
    useSaveButton({
      ...base,
      singleFile: false,
      saver: saver([], "replace"),
      targets: [stub("a", { isDirty: true, localFilePath: "C:/a.pdf" })],
      savesToDisk: true,
    }),
  );
  expect(result.current.label).toBe("Download");
});

it("keeps the view's plural label for several files", () => {
  const { result } = renderHook(() =>
    useSaveButton({
      ...base,
      singleFile: false,
      saver: saver([], "replace"),
      targets: [
        stub("a", { localFilePath: "C:/a.pdf" }),
        stub("b", { localFilePath: "C:/b.pdf" }),
      ],
      savesToDisk: true,
    }),
  );
  expect(result.current.label).toBeUndefined();
});
