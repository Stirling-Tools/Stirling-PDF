import { Blob as NodeBlob } from "node:buffer";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { SetConformanceClaimCommand } from "@editor/tools/pdfTextEditor/commands/SetConformanceClaimCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { applyConformanceClaim } from "@editor/tools/pdfTextEditor/pdfdoc/passes/conformanceClaim";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";

const FIXTURES = path.join(import.meta.dirname, "../../../tests/test-fixtures");

const opened: EditorDocument[] = [];

async function open(
  bytes: Uint8Array,
  password?: string,
): Promise<EditorDocument> {
  const doc = await EditorDocument.open(bytes, password);
  opened.push(doc);
  return doc;
}

async function openFixture(name: string): Promise<EditorDocument> {
  return open(new Uint8Array(await readFile(path.join(FIXTURES, name))));
}

async function saved(doc: EditorDocument): Promise<EditorDocument> {
  const blob = await exportToBlob(doc);
  return open(new Uint8Array(await blob.arrayBuffer()));
}

beforeAll(async () => {
  const wasmPath = createRequire(import.meta.url).resolve(
    "@embedpdf/pdfium/pdfium.wasm",
  );
  const wasmBytes = await readFile(wasmPath);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Promise.resolve(
        new Response(wasmBytes, {
          headers: { "Content-Type": "application/wasm" },
        }),
      ),
    ),
  );
  // jsdom's Blob cannot stream, so the fixture's object stream would not inflate.
  vi.stubGlobal("Blob", NodeBlob);
});

afterEach(() => {
  while (opened.length) opened.pop()!.dispose();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("the PDF/UA claim", () => {
  test("is saved, read back, and undone", async () => {
    const doc = await openFixture("tagged-sample.pdf");
    expect(doc.canSetConformanceClaim()).toBe(true);
    expect(doc.conformanceClaim()).toBeNull();

    const history = new HistoryStack();
    history.execute(new SetConformanceClaimCommand(2), doc);
    expect(doc.conformanceClaim()).toBe(2);
    expect((await saved(doc)).conformanceClaim()).toBe(2);

    history.undo(doc);
    expect(doc.conformanceClaim()).toBeNull();
    expect(doc.conformanceClaimEdit()).toBeUndefined();
  });

  test("is withdrawn from a file that declares it", async () => {
    const declaring = await openFixture("tagged-sample.pdf");
    new HistoryStack().execute(new SetConformanceClaimCommand(1), declaring);
    const doc = await saved(declaring);
    expect(doc.conformanceClaim()).toBe(1);

    const history = new HistoryStack();
    history.execute(new SetConformanceClaimCommand(null), doc);
    expect((await saved(doc)).conformanceClaim()).toBeNull();

    history.undo(doc);
    expect(doc.conformanceClaimEdit()).toBeUndefined();
    expect(doc.conformanceClaim()).toBe(1);
  });

  test("is rewritten under the pdfuaid prefix when the file uses another", async () => {
    const fixture = new Uint8Array(
      await readFile(path.join(FIXTURES, "tagged-sample.pdf")),
    );
    const declared = await applyConformanceClaim(fixture, 1);
    // Same length as "pdfuaid", so the xref offsets and stream Length still hold.
    const misprefixed = Uint8Array.from(
      Buffer.from(declared).toString("latin1").replaceAll("pdfuaid", "uaclaim"),
      (char) => char.charCodeAt(0),
    );
    const doc = await open(misprefixed);
    expect(doc.conformanceClaim()).toBeNull();

    new HistoryStack().execute(new SetConformanceClaimCommand(1), doc);
    expect((await saved(doc)).conformanceClaim()).toBe(1);
  });

  test("leaves an unchanged file byte for byte", async () => {
    const bytes = new Uint8Array(
      await readFile(path.join(FIXTURES, "tagged-sample.pdf")),
    );
    const doc = await open(bytes);
    const history = new HistoryStack();
    history.execute(new SetConformanceClaimCommand(1), doc);
    history.undo(doc);
    const blob = await exportToBlob(doc);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });

  test("cannot be set on an encrypted file", async () => {
    const doc = await open(
      new Uint8Array(
        await readFile(path.join(FIXTURES, "encrypted-links.pdf")),
      ),
      "annotation-test",
    );
    expect(doc.canSetConformanceClaim()).toBe(false);
    expect(() =>
      new HistoryStack().execute(new SetConformanceClaimCommand(1), doc),
    ).toThrow();
    expect(doc.conformanceClaim()).toBeNull();
  });
});
