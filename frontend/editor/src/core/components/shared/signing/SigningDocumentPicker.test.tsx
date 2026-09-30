import { act, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, beforeAll, afterAll, expect, it, vi } from "vitest";
import { SigningDocumentPicker } from "@app/components/shared/signing/SigningDocumentPicker";
import {
  createNewStirlingFileStub,
  createStirlingFile,
} from "@app/types/fileContext";

const state = vi.hoisted(() => ({
  open: vi.fn(),
  add: vi.fn(),
  files: vi.fn(),
  stubs: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));
vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({ fileStubs: state.stubs() }),
}));
vi.mock("@app/contexts/file/fileHooks", () => ({
  useFileSelectors: () => ({ getFiles: state.files }),
}));
vi.mock("@app/contexts/FilesModalContext", () => ({
  useFilesModalContext: () => ({ openFilesModal: state.open }),
}));
vi.mock("@app/hooks/useFileHandler", () => ({
  useFileHandler: () => ({ addFiles: state.add }),
}));
vi.mock("@app/hooks/useFileThumbnail", () => ({
  useFileThumbnail: () => ({
    thumbnail: null,
    isEncrypted: false,
    isGenerating: false,
  }),
}));
vi.mock("@app/components/shared/filePreview/DocumentThumbnail", () => ({
  default: () => null,
}));

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterAll(() => {
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
});

beforeEach(() => {
  vi.clearAllMocks();
  state.stubs.mockReturnValue([]);
  state.files.mockReturnValue([]);
});

function show(value: string | null = null) {
  const onChange = vi.fn();
  const onLoadingChange = vi.fn();
  render(
    <MantineProvider env="test">
      <SigningDocumentPicker
        value={value}
        onChange={onChange}
        disabled={false}
        loading={false}
        onLoadingChange={onLoadingChange}
      />
    </MantineProvider>,
  );
  return { onChange, onLoadingChange };
}

it("shows only PDFs and selects an open document without importing it", () => {
  const first = createNewStirlingFileStub(new File(["one"], "First.pdf"));
  const second = createNewStirlingFileStub(new File(["two"], "Second.pdf"));
  state.stubs.mockReturnValue([
    first,
    second,
    createNewStirlingFileStub(new File([], "Notes.txt")),
  ]);
  const { onChange } = show(first.id);
  expect(screen.getByRole("radio", { name: "First.pdf" })).toBeChecked();
  expect(screen.getAllByRole("radio")).toHaveLength(2);
  fireEvent.click(screen.getByRole("radio", { name: "Second.pdf" }));
  expect(onChange).toHaveBeenCalledWith(second.id);
  expect(state.add).not.toHaveBeenCalled();
});

it("uses the single-PDF library picker and reuses an already-open file", async () => {
  const file = createStirlingFile(new File(["same"], "Open.pdf"));
  state.files.mockReturnValue([file]);
  const { onChange } = show();
  fireEvent.click(screen.getByRole("button", { name: "Choose from library" }));
  const options = state.open.mock.calls[0][0];
  expect(options).toMatchObject({
    supportedFormats: ["pdf"],
    maxSelectable: 1,
  });
  await act(() => options.customHandler([file]));
  expect(onChange).toHaveBeenCalledWith(file.fileId);
  expect(state.add).not.toHaveBeenCalled();
});

it("selects the imported PDF and releases loading state when ingestion fails", async () => {
  const source = new File(["new"], "New.pdf");
  const added = createStirlingFile(source);
  state.add
    .mockResolvedValueOnce([added])
    .mockRejectedValueOnce(new Error("Storage unavailable"));
  const { onChange, onLoadingChange } = show();
  fireEvent.click(screen.getByRole("button", { name: "Choose from library" }));
  const options = state.open.mock.calls[0][0];
  await act(() => options.customHandler([source]));
  expect(state.add).toHaveBeenCalledWith([source], { selectFiles: false });
  expect(onChange).toHaveBeenCalledExactlyOnceWith(added.fileId);
  await act(async () => {
    await expect(options.customHandler([source])).rejects.toThrow(
      "Storage unavailable",
    );
  });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onLoadingChange).toHaveBeenLastCalledWith(false);
});

it("rejects a multi-document bundle before changing the selected PDF", async () => {
  const { onChange } = show();
  fireEvent.click(screen.getByRole("button", { name: "Choose from library" }));
  const options = state.open.mock.calls[0][0];
  await act(async () => {
    await expect(
      options.customHandler([new File([], "One.pdf"), new File([], "Two.pdf")]),
    ).rejects.toThrow("Choose one PDF");
    await expect(
      options.customHandler([new File([], "Notes.txt")]),
    ).rejects.toThrow("Choose one PDF");
  });
  expect(onChange).not.toHaveBeenCalled();
  expect(state.add).not.toHaveBeenCalled();
});
