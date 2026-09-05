import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
  decodePDFRawStream,
} from "@cantoo/pdf-lib";
import type { PdfAttachmentObject } from "@embedpdf/models";

// Reads a portfolio's members from the file's own bytes. The viewer's attachment
// capability only covers the open document, which stops being the portfolio.

const KEY_NAMES = PDFName.of("Names");
const KEY_KIDS = PDFName.of("Kids");
const KEY_EMBEDDED_FILES = PDFName.of("EmbeddedFiles");
const KEY_EF = PDFName.of("EF");
const KEY_F = PDFName.of("F");
const KEY_UF = PDFName.of("UF");
const KEY_DESC = PDFName.of("Desc");
const KEY_SUBTYPE = PDFName.of("Subtype");
const KEY_PARAMS = PDFName.of("Params");
const KEY_SIZE = PDFName.of("Size");
const KEY_CREATION_DATE = PDFName.of("CreationDate");
const KEY_COLLECTION = PDFName.of("Collection");

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

const decodeText = (value: unknown): string | null => {
  if (value instanceof PDFString || value instanceof PDFHexString) {
    return value.decodeText();
  }
  return null;
};

// Name trees are balanced into Kids once they grow, so both shapes must be read.
const collectSpecs = (
  node: PDFDict | undefined,
  into: Map<string, PDFDict>,
) => {
  if (!node) return;

  const names = node.lookupMaybe(KEY_NAMES, PDFArray);
  if (names) {
    for (let i = 0; i + 1 < names.size(); i += 2) {
      const name = decodeText(names.lookup(i));
      const spec = names.lookupMaybe(i + 1, PDFDict);
      if (name && spec) {
        into.set(name, spec);
      }
    }
  }

  const kids = node.lookupMaybe(KEY_KIDS, PDFArray);
  if (kids) {
    for (let i = 0; i < kids.size(); i += 1) {
      collectSpecs(kids.lookupMaybe(i, PDFDict), into);
    }
  }
};

const load = async (file: File): Promise<LoadedPortfolio | null> => {
  try {
    const doc = await PDFDocument.load(await file.arrayBuffer(), {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
      updateMetadata: false,
    });
    const specs = new Map<string, PDFDict>();
    collectSpecs(
      doc.catalog
        .lookupMaybe(KEY_NAMES, PDFDict)
        ?.lookupMaybe(KEY_EMBEDDED_FILES, PDFDict),
      specs,
    );
    return { doc, specs, isPortfolio: doc.catalog.get(KEY_COLLECTION) != null };
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
): PDFRawStream | undefined => {
  const ef = spec.lookupMaybe(KEY_EF, PDFDict);
  const ref = ef?.get(KEY_F) ?? ef?.get(KEY_UF);
  const stream = ref ? loaded.doc.context.lookup(ref) : undefined;
  return stream instanceof PDFRawStream ? stream : undefined;
};

/** Members shaped like the viewer's attachment objects; null when not a portfolio. */
export async function readPortfolioMembers(
  file: File,
): Promise<PdfAttachmentObject[] | null> {
  const remembered = answers.get(file);
  if (remembered !== undefined) return remembered;

  const loaded = await open(file);
  if (!loaded || !loaded.isPortfolio) {
    answers.set(file, null);
    return null;
  }

  const members: PdfAttachmentObject[] = [];
  let index = 0;
  for (const [name, spec] of loaded.specs) {
    const stream = streamOf(loaded, spec);
    const params = stream?.dict.lookupMaybe(KEY_PARAMS, PDFDict);
    members.push({
      index: index++,
      name,
      description: decodeText(spec.get(KEY_DESC)) ?? "",
      // Written as a PDF name, so it arrives with a leading slash.
      mimeType: (stream?.dict.get(KEY_SUBTYPE)?.toString() ?? "").replace(
        /^\//,
        "",
      ),
      size: params?.lookupMaybe(KEY_SIZE, PDFNumber)?.asNumber(),
      creationDate: parsePdfDate(decodeText(params?.get(KEY_CREATION_DATE))),
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
    const stream = streamOf(loaded, spec);
    return stream ? decodePDFRawStream(stream).decode() : null;
  } catch {
    return null;
  }
}
