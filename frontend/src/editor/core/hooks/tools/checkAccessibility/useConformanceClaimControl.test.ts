import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConformanceClaimControl } from "@editor/hooks/tools/checkAccessibility/useConformanceClaimControl";
import { RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import { readConformanceClaim } from "@editor/tools/pdfTextEditor/pdfdoc/passes/conformanceClaim";
import { reviewConformanceClaim } from "@editor/tools/pdfTextEditor/store/reviewConformanceClaim";
import { buildClassicPdf } from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";
import type { AccessibilityReport } from "@editor/types/checkAccessibility";
import type { FileId } from "@editor/types/file";
import { allowConsole } from "@editor/tests/failOnConsole";

const fileContext = vi.hoisted(() => ({
  file: null as File | null,
  consumeFiles: vi.fn(),
}));
const viewer = vi.hoisted(() => ({
  activeFileId: null as string | null,
  setActiveFileId: vi.fn(),
}));
const toast = vi.hoisted(() => ({ alert: vi.fn() }));

vi.mock("@editor/contexts/FileContext", () => ({
  useFileContext: () => ({
    consumeFiles: fileContext.consumeFiles,
    selectors: {
      getFile: () => fileContext.file,
      getStirlingFileStub: () =>
        fileContext.file ? { id: "checked", sourceFileIds: [] } : undefined,
    },
  }),
}));
vi.mock("@editor/contexts/ViewerContext", () => ({
  useViewer: () => viewer,
}));
vi.mock("@editor/components/toast", () => toast);
vi.mock("@editor/services/fileStubHelpers", () => ({
  createStirlingFilesAndStubs: async (files: File[]) => ({
    stirlingFiles: files,
    stubs: [{ id: "written" }],
  }),
}));

const CHECKED = "checked" as FileId;

const REPORT = {
  profile: "PDF/UA-1",
  declaresConformance: false,
  summary: { encrypted: false },
} as AccessibilityReport;

const PDF = buildClassicPdf(
  [
    { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
    { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
    {
      num: 3,
      body: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
    },
  ],
  1,
);

function render(report: AccessibilityReport = REPORT) {
  const onWritten = vi.fn();
  const view = renderHook(() =>
    useConformanceClaimControl(CHECKED, report, onWritten),
  );
  return { view, onWritten };
}

// setupTests stands in a fixed buffer for File.arrayBuffer; these need the real bytes.
function withBytes(bytes: Uint8Array): File {
  return Object.assign(new File([bytes as BlobPart], "checked.pdf"), {
    arrayBuffer: async () => bytes.slice().buffer,
  });
}

function readBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

async function writtenClaim(): Promise<number | null> {
  const [consumed, written] = fileContext.consumeFiles.mock.calls[0];
  expect(consumed).toEqual([CHECKED]);
  const raw = await RawPdf.parse(await readBytes(written[0]));
  return (await readConformanceClaim(raw!)).part;
}

beforeEach(() => {
  fileContext.file = withBytes(PDF);
  fileContext.consumeFiles.mockReset().mockResolvedValue(["written"]);
  viewer.activeFileId = null;
  viewer.setActiveFileId.mockReset();
  toast.alert.mockReset();
});

afterEach(() => {
  cleanup();
  reviewConformanceClaim.set(null);
});

describe("useConformanceClaimControl", () => {
  it("writes the claim as a new version when the review does not have the file", async () => {
    viewer.activeFileId = CHECKED;
    const { view, onWritten } = render();
    expect(view.result.current).toMatchObject({
      declared: false,
      editable: true,
    });

    act(() => view.result.current!.set(1));

    await waitFor(() => expect(onWritten).toHaveBeenCalledWith("written"));
    expect(await writtenClaim()).toBe(1);
    expect(viewer.setActiveFileId).toHaveBeenCalledWith("written");
    expect(view.result.current!.writing).toBe(false);
  });

  it("hands the change to the review when it has the file open", () => {
    const set = vi.fn();
    reviewConformanceClaim.set({
      fileId: CHECKED,
      part: 2,
      editable: true,
      set,
    });
    const { view } = render();
    expect(view.result.current).toMatchObject({ declared: true, part: 2 });

    act(() => view.result.current!.set(null));

    expect(set).toHaveBeenCalledWith(null);
    expect(fileContext.consumeFiles).not.toHaveBeenCalled();
  });

  it("follows the review's claim, not the report's, while it has the file open", () => {
    const { view } = render({ ...REPORT, declaresConformance: true });
    expect(view.result.current!.declared).toBe(true);

    act(() =>
      reviewConformanceClaim.set({
        fileId: CHECKED,
        part: null,
        editable: true,
        set: vi.fn(),
      }),
    );

    expect(view.result.current!.declared).toBe(false);
  });

  it("cannot change an encrypted file", () => {
    const { view } = render({
      ...REPORT,
      summary: { encrypted: true },
    } as AccessibilityReport);
    expect(view.result.current!.editable).toBe(false);
  });

  it("reports a file it cannot rewrite, and leaves it in place", async () => {
    fileContext.file = withBytes(new TextEncoder().encode("not a pdf"));
    allowConsole.error(/could not be read/);
    const { view, onWritten } = render();

    act(() => view.result.current!.set(1));

    await waitFor(() => expect(toast.alert).toHaveBeenCalledOnce());
    expect(fileContext.consumeFiles).not.toHaveBeenCalled();
    expect(onWritten).not.toHaveBeenCalled();
  });
});
