import type {
  PDFDict,
  PDFDocument,
  PDFRawStream,
} from "@cantoo/pdf-lib";
import type { PdfAttachmentObject } from "@embedpdf/models";

// Reads a portfolio's members from the file's own bytes. The viewer's attachment
// capability only covers the open document, which stops being the portfolio.
//
// pdf-lib (~628kB raw / ~266kB gzip) is loaded lazily via dynamic import so it
// never blocks the Viewer chunk. The Viewer statically imports this module
// (via usePortfolioSession + AttachmentSidebar), so a static value import here
// would force every /editor open to download+parse vendor-pdflib before the
// viewer can run — even though <1% of documents are portfolios.

type PdfLib = typeof import("@cantoo/pdf-lib");

let pdfLibPromise: Promise<PdfLib> | null = null;

const getPdfLib = (): Promise<PdfLib> => {
  pdfLibPromise ??= import("@cantoo/pdf-lib");
  return pdfLibPromise;
};

// Key names as plain strings; PDFName.of() is applied at runtime after the
// dynamic import resolves, so module evaluation stays free of pdf-lib.
const KEY_NAMES = "Names";
const KEY_KIDS = "Kids";
const KEY_EMBEDDED_FILES = "EmbeddedFiles";
const KEY_EF = "EF";
const KEY_F = "F";
const KEY_UF = "UF";
const KEY_DESC = "Desc";
const KEY_SUBTYPE = "Subtype";
const KEY_PARAMS = "Params";
const KEY_SIZE = "Size";
const KEY_CREATION_DATE = "CreationDate";
const KEY_COLLECTION = "Collection";

const MAX_NAME_TREE_DEPTH = 64;

type LoadedPortfolio = {
  doc: PDFDocument;
  specs: Map<string, PDFDict>;
  isPortfolio: boolean;
};

// One entry is enough: the reader works through a single portfolio at a time,
// and holding more would pin their bytes in memory for no benefit.
let cache: { file: File; loaded: Promise<LoadedPortfolio | null> } | null =
  null;

// Every file switch asks whether the document is a portfolio, and most aren't.
// Remembering the answer avoids reparsing; no document bytes are held.
const answers = new WeakMap<File, PdfAttachmentObject[] | null>();

const decodeText = (value: unknown, pdfLib: PdfLib): string | null => {
  if (
    value instanceof pdfLib.PDFString ||
    value instanceof pdfLib.PDFHexString ||
    value instanceof pdfLib.PDFName
  ) {
    return value.decodeText();
  }
  return null;
};

// Name trees are balanced into Kids once they grow, so both shapes must be read.
const collectSpecs = (
  node: PDFDict | undefined,
  into: Map<string, PDFDict>,
  pdfLib: PdfLib,
  seen: Set<PDFDict> = new Set(),
  depth = 0,
) => {
  if (!node || depth > MAX_NAME_TREE_DEPTH || seen.has(node)) return;
  seen.add(node);

  const names = node.lookupMaybe(
    pdfLib.PDFName.of(KEY_NAMES),
    pdfLib.PDFArray,
  );
  if (names) {
    for (let i = 0; i + 1 < names.size(); i += 2) {
      const name = decodeText(names.lookup(i), pdfLib);
      const spec = names.lookupMaybe(i + 1, pdfLib.PDFDict);
      if (name && spec) {
        into.set(name, spec);
      }
    }
  }

  const kids = node.lookupMaybe(pdfLib.PDFName.of(KEY_KIDS), pdfLib.PDFArray);
  if (kids) {
    for (let i = 0; i < kids.size(); i += 1) {
      collectSpecs(
        kids.lookupMaybe(i, pdfLib.PDFDict),
        into,
        pdfLib,
        seen,
        depth + 1,
      );
    }
  }
};

const load = async (file: File): Promise<LoadedPortfolio | null> => {
  try {
    const pdfLib = await getPdfLib();
    const doc = await pdfLib.PDFDocument.load(await file.arrayBuffer(), {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
      updateMetadata: false,
    });
    const specs = new Map<string, PDFDict>();
    collectSpecs(
      doc.catalog
        .lookupMaybe(pdfLib.PDFName.of(KEY_NAMES), pdfLib.PDFDict)
        ?.lookupMaybe(
          pdfLib.PDFName.of(KEY_EMBEDDED_FILES),
          pdfLib.PDFDict,
        ),
      specs,
      pdfLib,
    );
    return {
      doc,
      specs,
      isPortfolio:
        doc.catalog.get(pdfLib.PDFName.of(KEY_COLLECTION)) != null,
    };
  } catch {
    return null;
  }
};

const open = (file: File): Promise<LoadedPortfolio | null> => {
  if (cache?.file !== file) {
    cache = { file, loaded: load(file) };
  }
  return cache.loaded;
};

// PDF date strings are "D:YYYYMMDDHHmmSS" with an optional timezone tail.
const parsePdfDate = (value: string | null): Date | undefined => {
  const match = value?.match(
    /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/,
  );
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month ?? "1") - 1,
      Number(day ?? "1"),
      Number(hour ?? "0"),
      Number(minute ?? "0"),
      Number(second ?? "0"),
    ),
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const streamOf = (
  loaded: LoadedPortfolio,
  spec: PDFDict,
  pdfLib: PdfLib,
): PDFRawStream | undefined => {
  const ef = spec.lookupMaybe(pdfLib.PDFName.of(KEY_EF), pdfLib.PDFDict);
  const ref = ef?.get(pdfLib.PDFName.of(KEY_F)) ?? ef?.get(pdfLib.PDFName.of(KEY_UF));
  const stream = ref ? loaded.doc.context.lookup(ref) : undefined;
  return stream instanceof pdfLib.PDFRawStream ? stream : undefined;
};

/** Members shaped like the viewer's attachment objects; null when not a portfolio. */
export async function readPortfolioMembers(
  file: File,
): Promise<PdfAttachmentObject[] | null> {
  const remembered = answers.get(file);
  if (remembered !== undefined) return remembered;

  const loaded = await open(file);
  if (!loaded || !loaded.isPortfolio) {
    // Nothing will ask for this document's bytes again, so drop them rather
    // than pin them until the next file is opened.
    if (cache?.file === file) cache = null;
    answers.set(file, null);
    return null;
  }

  const members: PdfAttachmentObject[] = [];
  let index = 0;
  const pdfLib = await getPdfLib();
  for (const [name, spec] of loaded.specs) {
    const stream = streamOf(loaded, spec, pdfLib);
    const params = stream?.dict.lookupMaybe(
      pdfLib.PDFName.of(KEY_PARAMS),
      pdfLib.PDFDict,
    );
    members.push({
      index: index++,
      name,
      description:
        decodeText(spec.get(pdfLib.PDFName.of(KEY_DESC)), pdfLib) ?? "",
      mimeType:
        decodeText(
          stream?.dict.get(pdfLib.PDFName.of(KEY_SUBTYPE)),
          pdfLib,
        ) ?? "",
      size: params
        ?.lookupMaybe(pdfLib.PDFName.of(KEY_SIZE), pdfLib.PDFNumber)
        ?.asNumber(),
      creationDate: parsePdfDate(
        decodeText(
          params?.get(pdfLib.PDFName.of(KEY_CREATION_DATE)),
          pdfLib,
        ),
      ),
      checksum: "",
    });
  }
  members.sort((a, b) => a.name.localeCompare(b.name));
  answers.set(file, members);
  return members;
}

/** Decoded bytes of one member, or null when it can't be read. */
export async function readPortfolioMemberBytes(
  file: File,
  name: string,
): Promise<Uint8Array | null> {
  const loaded = await open(file);
  const spec = loaded?.specs.get(name);
  if (!loaded || !spec) return null;

  try {
    const pdfLib = await getPdfLib();
    const stream = streamOf(loaded, spec, pdfLib);
    return stream ? pdfLib.decodePDFRawStream(stream).decode() : null;
  } catch {
    return null;
  }
}
