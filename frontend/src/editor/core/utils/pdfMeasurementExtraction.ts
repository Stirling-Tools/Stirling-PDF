import { PdfFileReader, type PdfValue } from "@app/utils/pdfObjectReader";
import type {
  MeasureScale,
  PageMeasureScales,
  PageScaleInfo,
  ViewportScale,
} from "@app/utils/measurementTypes";
import { getUnitFactor } from "@app/utils/measurementUtils";
import { getDocumentBytes } from "@app/services/documentBytesCache";

type PdfDictMap = Map<string, PdfValue>;

const asDict = (value: PdfValue | undefined): PdfDictMap | undefined => {
  if (value?.kind === "dict") return value.map;
  if (value?.kind === "stream") return value.dict;
  return undefined;
};

const asNumber = (value: PdfValue | undefined): number | null =>
  value?.kind === "number" ? value.value : null;

const asArray = (value: PdfValue | undefined): PdfValue[] | null =>
  value?.kind === "array" ? value.items : null;

async function dictAt(
  reader: PdfFileReader,
  dict: PdfDictMap | undefined,
  key: string,
): Promise<PdfDictMap | undefined> {
  return asDict(await reader.dictGet(dict, key));
}

async function numberAt(
  reader: PdfFileReader,
  dict: PdfDictMap | undefined,
  key: string,
): Promise<number | null> {
  return asNumber(await reader.dictGet(dict, key));
}

async function textAt(
  reader: PdfFileReader,
  dict: PdfDictMap | undefined,
  key: string,
): Promise<string | null> {
  const value = await reader.dictGet(dict, key);
  if (value?.kind === "name") return value.name;
  if (value?.kind === "string") return (await reader.stringText(value)) ?? null;
  return null;
}

async function readBBox(
  reader: PdfFileReader,
  dict: PdfDictMap,
): Promise<ViewportScale["bbox"]> {
  const array = asArray(await reader.dictGet(dict, "BBox"));
  if (!array || array.length < 4) return null;
  const values = await Promise.all(
    array.slice(0, 4).map((item) => reader.resolveValue(item)),
  );
  const [x0, y0, x1, y1] = values.map(asNumber);
  if (x0 === null || y0 === null || x1 === null || y1 === null) return null;
  return [x0, y0, x1, y1];
}

async function parseScale(
  reader: PdfFileReader,
  measureDict: PdfDictMap | undefined,
): Promise<MeasureScale | null> {
  if (!measureDict) return null;

  const formats =
    asArray(await reader.dictGet(measureDict, "D")) ??
    asArray(await reader.dictGet(measureDict, "X"));
  if (!formats || formats.length === 0) return null;

  const firstFmt = asDict(await reader.resolveValue(formats[0]));
  if (!firstFmt) return null;

  const factor = await numberAt(reader, firstFmt, "C");
  if (factor === null || factor <= 0) return null;

  const unit = (await textAt(reader, firstFmt, "U"))?.trim().toLowerCase();
  if (!unit) return null;

  const baseFactor = getUnitFactor(unit);
  if (!baseFactor) return null;

  return { factor, ratio: factor / baseFactor, unit };
}

/** Page dictionaries in document order, following the catalog's page tree. */
async function readPageDicts(
  reader: PdfFileReader,
): Promise<{ dict: PdfDictMap; mediaBox?: number[] }[]> {
  if (!reader.root) return [];
  const catalog = asDict(
    await reader.resolveValue({ kind: "ref", ref: reader.root }),
  );
  if (!catalog) return [];
  const pagesRoot = catalog.get("Pages");
  if (!pagesRoot) return [];

  const pages: { dict: PdfDictMap; mediaBox?: number[] }[] = [];

  const readBox = async (dict: PdfDictMap): Promise<number[] | undefined> => {
    for (const key of ["MediaBox", "CropBox"]) {
      const array = asArray(await reader.dictGet(dict, key));
      if (!array || array.length < 4) continue;
      const values = await Promise.all(
        array.slice(0, 4).map((item) => reader.resolveValue(item)),
      );
      const numbers = values.map(asNumber);
      if (numbers.every((n): n is number => n !== null)) return numbers;
    }
    return undefined;
  };

  const walk = async (
    value: PdfValue,
    inheritedBox?: number[],
  ): Promise<void> => {
    const dict = asDict(await reader.resolveValue(value));
    if (!dict) return;
    const typeValue = await reader.dictGet(dict, "Type");
    const type = typeValue?.kind === "name" ? typeValue.name : undefined;
    const mediaBox = (await readBox(dict)) ?? inheritedBox;

    if (type === "Pages") {
      const kids = asArray(await reader.dictGet(dict, "Kids"));
      if (kids) for (const kid of kids) await walk(kid, mediaBox);
      return;
    }

    // Leaf page (Type /Page is optional in the wild).
    pages.push({ dict, mediaBox });
  };

  await walk(pagesRoot);
  return pages;
}

export async function extractPageMeasureScales(
  file: Blob,
): Promise<PageMeasureScales | null> {
  try {
    const bytes = new Uint8Array(await getDocumentBytes(file));
    const reader = await PdfFileReader.open(bytes);
    const pages = await readPageDicts(reader);
    const result: PageMeasureScales = new Map();

    for (let i = 0; i < pages.length; i++) {
      const { dict: page, mediaBox } = pages[i];
      const pageHeight = mediaBox ? Math.abs(mediaBox[3] - mediaBox[1]) : 0;
      const viewports: ViewportScale[] = [];

      const vpArray = asArray(await reader.dictGet(page, "VP"));
      if (vpArray) {
        for (const entryValue of vpArray) {
          const entry = asDict(await reader.resolveValue(entryValue));
          if (!entry) continue;
          const scale = await parseScale(
            reader,
            await dictAt(reader, entry, "Measure"),
          );
          if (!scale) continue;
          viewports.push({ bbox: await readBBox(reader, entry), scale });
        }
      }

      if (viewports.length === 0) {
        const scale = await parseScale(
          reader,
          await dictAt(reader, page, "Measure"),
        );
        if (scale) viewports.push({ bbox: null, scale });
      }

      if (viewports.length > 0) {
        result.set(i, { viewports, pageHeight } satisfies PageScaleInfo);
      }
    }

    return result.size > 0 ? result : null;
  } catch (error) {
    console.warn("[Measurement] Failed to extract PDF scales", error);
    return null;
  }
}
