import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCheckedFileClaim,
  useConformanceClaim,
} from "@editor/hooks/tools/checkAccessibility/useConformanceClaimControl";
import { RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import { readConformanceClaim } from "@editor/tools/pdfTextEditor/pdfdoc/passes/conformanceClaim";
import { reviewConformanceClaim } from "@editor/tools/pdfTextEditor/store/reviewConformanceClaim";
import { buildClassicPdf } from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";
import type {
  AccessibilityIssue,
  AccessibilityReport,
} from "@editor/types/checkAccessibility";
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

const REPORT: AccessibilityReport = {
  profile: "PDF/UA-1",
  tagged: true,
  declaresConformance: false,
  passesAutomatedChecks: false,
  issues: [],
  humanChecks: [],
  automaticallyFixable: 0,
  needsInput: 0,
  figuresNeedingDescription: [],
  summary: {
    pages: 1,
    hasTitle: true,
    displaysDocTitle: true,
    hasLanguage: true,
    allFontsEmbedded: true,
    unembeddedFonts: 0,
    figures: 0,
    encrypted: false,
  },
};

const CLAUSE_5_ISSUE: AccessibilityIssue = {
  clause: "5",
  testNumber: "2",
  specification: "PDF/UA-1",
  message: "",
  severity: "error",
  occurrences: 1,
  autoFixable: false,
};

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

const OTHER = "other" as FileId;

function render(report: AccessibilityReport = REPORT) {
  const onWritten = vi.fn();
  const view = renderHook(
    ({ fileId }: { fileId: FileId }) =>
      useConformanceClaim(useCheckedFileClaim(fileId, report, onWritten), 1),
    { initialProps: { fileId: CHECKED } },
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

describe("the checked file's claim", () => {
  it("writes the claim as a new version when the review does not have the file", async () => {
    viewer.activeFileId = CHECKED;
    const { view, onWritten } = render();
    expect(view.result.current).toMatchObject({
      declared: false,
      editable: true,
    });

    act(() => view.result.current!.set(1));
    expect(view.result.current).toMatchObject({
      declared: true,
      writing: true,
    });

    await waitFor(() => expect(onWritten).toHaveBeenCalledWith("written"));
    expect(await writtenClaim()).toBe(1);
    expect(viewer.setActiveFileId).toHaveBeenCalledWith("written");
    expect(view.result.current!.writing).toBe(false);
  });

  it("shows the write only on the file being written, and keeps where the user moved to", async () => {
    viewer.activeFileId = CHECKED;
    let finish: (ids: string[]) => void = () => {};
    fileContext.consumeFiles.mockReturnValue(
      new Promise((resolve) => (finish = resolve)),
    );
    const { view, onWritten } = render();

    act(() => view.result.current!.set(1));
    await waitFor(() => expect(fileContext.consumeFiles).toHaveBeenCalled());
    viewer.activeFileId = OTHER;
    view.rerender({ fileId: OTHER });
    expect(view.result.current).toMatchObject({
      declared: false,
      writing: false,
    });

    await act(async () => finish(["written"]));
    expect(viewer.setActiveFileId).not.toHaveBeenCalled();
    expect(onWritten).not.toHaveBeenCalled();
  });

  it("hands the change to the review when it has the file open", () => {
    const set = vi.fn();
    reviewConformanceClaim.set({
      fileId: CHECKED,
      part: 1,
      editable: true,
      set,
    });
    const { view } = render();
    expect(view.result.current!.declared).toBe(true);

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

  it("counts only a declaration of the part asked about", () => {
    reviewConformanceClaim.set({
      fileId: CHECKED,
      part: 2,
      editable: true,
      set: vi.fn(),
    });
    const { view } = render();
    expect(view.result.current!.declared).toBe(false);
  });

  it("does not count a declaration the check rejects", () => {
    const { view } = render({
      ...REPORT,
      declaresConformance: true,
      issues: [CLAUSE_5_ISSUE],
    });
    expect(view.result.current!.declared).toBe(false);
  });

  it("cannot change an encrypted file", () => {
    const { view } = render({
      ...REPORT,
      summary: { ...REPORT.summary, encrypted: true },
    });
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
    expect(view.result.current).toMatchObject({
      declared: false,
      writing: false,
    });
  });
});
