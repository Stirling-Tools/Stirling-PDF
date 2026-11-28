import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { useSyncExternalStore } from "react";
import { act, renderHook } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { FileId } from "@editor/types/file";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { useReviewLanguageBridge } from "@editor/tools/pdfTextEditor/hooks/useReviewLanguageBridge";
import { useReviewStart } from "@editor/tools/pdfTextEditor/hooks/useReviewStart";
import {
  clearEditorSession,
  setEditorSession,
  type EditorSession,
} from "@editor/tools/pdfTextEditor/store/EditorSession";
import { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import { reviewLanguage } from "@editor/tools/pdfTextEditor/store/reviewLanguage";
import type { ReviewModeState } from "@editor/tools/pdfTextEditor/store/reviewMode";
import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

// The report's document-wide settings land in the review as unsaved edits: saving
// them at once would also save every tag edit still pending, past Discard's reach.

const FILE_ID = "file-1" as FileId;

/** One page, with a structure tree but not flagged as tagged, in English. */
function unflaggedPdf(): Uint8Array {
  return buildClassicPdf(
    [
      {
        num: 1,
        body:
          "<< /Type /Catalog /Pages 2 0 R /Lang (en-US) /StructTreeRoot 6 0 R " +
          "/MarkInfo << /Marked false >> >>",
      },
      { num: 2, body: "<< /Type /Pages /Kids [4 0 R] /Count 1 >>" },
      {
        num: 3,
        body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      },
      {
        num: 4,
        body:
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R " +
          "/Resources << /Font << /F1 3 0 R >> >> >>",
      },
      { num: 5, body: streamBody("", "BT /F1 10 Tf 72 400 Td (Body) Tj ET") },
      { num: 6, body: "<< /Type /StructTreeRoot /K [] >>" },
    ],
    1,
  );
}

async function openStore(): Promise<EditorStore> {
  const store = new EditorStore();
  const doc = await EditorDocument.open(unflaggedPdf());
  await store.setDocument(doc);
  const page = doc.page(0);
  store.publishPages([
    {
      pageIndex: 0,
      width: page.width,
      height: page.height,
      dirty: false,
      revision: 0,
      runs: [],
      images: [],
      shapes: [],
      display: page.display.toData(),
    } satisfies PageSnapshot,
  ]);
  return store;
}

function fakeSession(): EditorSession {
  return {
    fileName: "file.pdf",
    save: vi.fn(),
    download: vi.fn(),
    pickImage: vi.fn(),
    revealPage: vi.fn(),
  };
}

function useStoreState(store: EditorStore) {
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getState(),
  );
}

beforeAll(async () => {
  const wasmBytes = await readFile(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(wasmBytes, {
          headers: { "Content-Type": "application/wasm" },
        }),
    ),
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  reviewLanguage.set({ open: null, requested: null });
});

describe("report settings applied in the review", () => {
  it("applies the report's language as an unsaved edit", async () => {
    const store = await openStore();
    const session = fakeSession();
    setEditorSession(session);
    reviewLanguage.set({ requested: { fileId: FILE_ID, language: "en-IE" } });

    renderHook(() =>
      useReviewLanguageBridge(store, useStoreState(store), FILE_ID, true),
    );

    expect(store.document?.documentLanguage()).toBe("en-IE");
    expect(store.getState().dirty).toBe(true);
    expect(reviewLanguage.get().open?.language).toBe("en-IE");
    expect(session.save).not.toHaveBeenCalled();
    act(() => store.undo());
    expect(store.document?.documentLanguage()).toBe("en-US");
    expect(store.getState().dirty).toBe(false);
    clearEditorSession(session);
    store.dispose();
  });

  it("flags the document as tagged as an unsaved edit", async () => {
    const store = await openStore();
    const session = fakeSession();
    setEditorSession(session);
    const startAt: ReviewModeState["startAt"] = {
      fileId: FILE_ID,
      pageIndex: 0,
      target: "markedTagged",
    };

    const { unmount } = renderHook(() =>
      useReviewStart({
        store,
        startAt,
        sourceFileId: FILE_ID,
        setActiveFileId: vi.fn(),
      }),
    );

    expect(store.document?.markedTagged()).toBe(true);
    expect(store.getState().dirty).toBe(true);
    expect(session.save).not.toHaveBeenCalled();
    unmount();
    clearEditorSession(session);
    store.dispose();
  });
});
