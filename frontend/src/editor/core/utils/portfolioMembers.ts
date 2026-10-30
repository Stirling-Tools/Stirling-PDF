import type { PdfAttachmentObject } from "@embedpdf/models";
import { getDocumentBytes } from "@editor/services/documentBytesCache";
import { PdfFileReader } from "@editor/utils/pdfObjectReader";
import type { PdfValue } from "@editor/utils/pdfObjectReader";

// Reads a portfolio's members from the file's own bytes. The viewer's attachment
// capability only covers the open document, which stops being the portfolio.
//
// The in-repo reader is imported statically: it is already in the viewer's
// graph (the layer pipeline uses it) and parses lazily, so a portfolio-only
// scan costs the same as the old dynamic pdf-lib import without the chunk.

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
  reader: PdfFileReader;
  specs: Map<string, PdfValue>;
  isPortfolio: boolean;
};

// One entry is enough: the reader works through a single portfolio at a time,
// and holding more would pin their bytes in memory for no benefit.
let cache: { file: File; loaded: Promise<LoadedPortfolio | null> } | null =
  null;

// Every file switch asks whether the document is a portfolio, and most aren't.
// Remembering the answer avoids reparsing; no document bytes are held.
const answers = new WeakMap<File, PdfAttachmentObject[] | null>();

const decodeText = async (
  reader: PdfFileReader,
  value: PdfValue | undefined,
): Promise<string | null> => {
  const resolved = await reader.resolveValue(value);
  if (resolved?.kind === "string") {
    return (await reader.stringText(resolved)) ?? null;
  }
  if (resolved?.kind === "name") return resolved.name;
  return null;
};

const asDict = (
  value: PdfValue | undefined,
): Map<string, PdfValue> | undefined =>
  value?.kind === "dict" ? value.map : undefined;

// Name trees are balanced into Kids once they grow, so both shapes must be
// read. The reader caches parsed objects, so the same node keeps its identity
// across resolutions and a visited set stops crafted cycles.
const collectSpecs = async (
  reader: PdfFileReader,
  node: Map<string, PdfValue> | undefined,
  into: Map<string, PdfValue>,
  depth = 0,
  seen: Set<Map<string, PdfValue>> = new Set(),
): Promise<void> => {
  if (!node || depth > MAX_NAME_TREE_DEPTH || seen.has(node)) return;
  seen.add(node);

  const names = await reader.resolveValue(node.get(KEY_NAMES));
  if (names?.kind === "array") {
    for (let i = 0; i + 1 < names.items.length; i += 2) {
      const name = await decodeText(reader, names.items[i]);
      const spec = asDict(await reader.resolveValue(names.items[i + 1]));
      if (name && spec) {
        into.set(name, { kind: "dict", map: spec });
      }
    }
  }

  const kids = await reader.resolveValue(node.get(KEY_KIDS));
  if (kids?.kind === "array") {
    for (const kid of kids.items) {
      await collectSpecs(
        reader,
        asDict(await reader.resolveValue(kid)),
        into,
        depth + 1,
        seen,
      );
    }
  }
};

const load = async (file: File): Promise<LoadedPortfolio | null> => {
  try {
    const reader = await PdfFileReader.open(
      new Uint8Array(await getDocumentBytes(file)),
    );
    const catalog = await reader.resolveValue(
      reader.root ? { kind: "ref", ref: reader.root } : undefined,
    );
    if (catalog?.kind !== "dict") return null;

    const specs = new Map<string, PdfValue>();
    const namesDict = asDict(
      await reader.resolveValue(catalog.map.get("Names")),
    );
    const embedded = asDict(
      await reader.resolveValue(namesDict?.get(KEY_EMBEDDED_FILES)),
    );
    await collectSpecs(reader, embedded, specs);

    return {
      reader,
      specs,
      isPortfolio:
        (await reader.resolveValue(catalog.map.get(KEY_COLLECTION))) !==
        undefined,
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

const streamOf = async (
  reader: PdfFileReader,
  spec: PdfValue,
): Promise<PdfValue | null> => {
  const specMap = asDict(spec);
  const ef = asDict(await reader.resolveValue(specMap?.get(KEY_EF)));
  if (!ef) return null;
  const ref = ef.get(KEY_F) ?? ef.get(KEY_UF);
  const stream = await reader.resolveValue(ref);
  return stream?.kind === "stream" ? stream : null;
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

  const { reader } = loaded;
  const members: PdfAttachmentObject[] = [];
  let index = 0;
  for (const [name, spec] of loaded.specs) {
    const stream = await streamOf(reader, spec);
    const streamMap = stream?.kind === "stream" ? stream.dict : undefined;
    const params = asDict(
      await reader.resolveValue(streamMap?.get(KEY_PARAMS)),
    );
    const sizeValue = params
      ? await reader.resolveValue(params.get(KEY_SIZE))
      : undefined;
    members.push({
      index: index++,
      name,
      description:
        (await decodeText(reader, asDict(spec)?.get(KEY_DESC))) ?? "",
      mimeType: (await decodeText(reader, streamMap?.get(KEY_SUBTYPE))) ?? "",
      size: sizeValue?.kind === "number" ? sizeValue.value : undefined,
      creationDate: parsePdfDate(
        params ? await decodeText(reader, params.get(KEY_CREATION_DATE)) : null,
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
    const stream = await streamOf(loaded.reader, spec);
    return stream ? await loaded.reader.streamBytes(stream) : null;
  } catch {
    return null;
  }
}
