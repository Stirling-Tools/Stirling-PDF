import LayerParseWorker from "@app/workers/layerParseWorker?worker";
import {
  PdfFileReader,
  PdfStructureError,
  appendIncrementalUpdate,
  containsEncryptedString,
  rewriteDictBuffer,
  serializeValue,
  type ObjectUpdate,
  type PdfRef,
  type PdfValue,
} from "@app/utils/pdfObjectReader";
import type {
  LayerInfo,
  LayerParseRequest,
  LayerParseResponse,
} from "@app/components/viewer/layerParser";

export type { LayerInfo } from "@app/components/viewer/layerParser";

/**
 * Reads OCG layer info for the layers panel. The parse runs in a worker so a
 * large document cannot tie up the main thread, and the worker reads the blob
 * itself, so opening the panel never pulls pdf.js or a copy of the bytes onto
 * the main thread.
 */
export async function readPdfLayers(file: Blob): Promise<LayerInfo[]> {
  return await new Promise<LayerInfo[]>((resolve, reject) => {
    const worker = new LayerParseWorker();
    const settle = (finish: () => void) => {
      worker.terminate();
      finish();
    };
    worker.onmessage = (event: MessageEvent<LayerParseResponse>) => {
      const message = event.data;
      if ("error" in message) {
        settle(() => reject(new Error(message.error)));
        return;
      }
      settle(() => resolve(message.layers));
    };
    worker.onerror = (event) => {
      settle(() =>
        reject(new Error(event.message || "Layer parse worker failed")),
      );
    };
    worker.postMessage({ blob: file } satisfies LayerParseRequest);
  });
}

function refId(ref: PdfRef): string {
  return `${ref.num} ${ref.gen} R`;
}

function nameValue(key: string): string {
  return serializeValue({ kind: "name", name: key });
}

/**
 * Modifies OCG visibility by appending an incremental update to the file.
 *
 * Strategy: set /BaseState to /OFF and only list visible layers in /ON and
 * hidden ones in /OFF. This is the most unambiguous approach and avoids
 * conflicts between /BaseState, /ON, and /OFF that can confuse some viewers.
 * /AS (auto-state) entries are dropped because they can override visibility.
 *
 * The default config is rewritten in place wherever possible: every byte of
 * an untouched value survives, so unknown keys and encrypted strings stay
 * valid for the object number that holds them.
 */
export async function applyOCGVisibilityToPdf(
  pdfBytes: ArrayBuffer,
  layerVisibility: Record<string, boolean>,
): Promise<Uint8Array> {
  const reader = await PdfFileReader.open(new Uint8Array(pdfBytes));
  if (!reader.root) throw new PdfStructureError("PDF catalog is missing");
  const catalog = await reader.resolveValue({ kind: "ref", ref: reader.root });
  if (catalog?.kind !== "dict") {
    throw new PdfStructureError("PDF catalog is missing");
  }
  const ocPropertiesEntry = catalog.map.get("OCProperties");
  const ocProperties = await reader.resolveValue(ocPropertiesEntry);
  if (ocProperties?.kind !== "dict") return reader.bytes;
  const ocgs = await reader.resolveValue(ocProperties.map.get("OCGs"));
  if (ocgs?.kind !== "array") return reader.bytes;

  const onRefs: PdfRef[] = [];
  const offRefs: PdfRef[] = [];
  for (const item of ocgs.items) {
    if (item.kind !== "ref") continue;
    const dict = await reader.resolveValue(item);
    if (dict?.kind !== "dict") continue;
    const resolvedName = await reader.resolveValue(dict.map.get("Name"));
    const name =
      resolvedName?.kind === "string"
        ? ((await reader.stringText(resolvedName)) ?? "")
        : resolvedName?.kind === "name"
          ? resolvedName.name
          : "";
    ((layerVisibility[name] ?? true) ? onRefs : offRefs).push(item.ref);
  }

  const edits = new Map<string, string | null>([
    ["BaseState", "/OFF"],
    ["ON", onRefs.length > 0 ? `[${onRefs.map(refId).join(" ")}]` : null],
    ["OFF", offRefs.length > 0 ? `[${offRefs.map(refId).join(" ")}]` : null],
    ["AS", null],
  ]);

  const updates: ObjectUpdate[] = [];
  const defaultEntry = ocProperties.map.get("D");
  const defaultRef = defaultEntry?.kind === "ref" ? defaultEntry.ref : null;

  if (defaultRef) {
    const span = await reader.getRawSpan(defaultRef.num);
    if (span && !span.inStream && span.buffer === reader.bytes) {
      updates.push({
        num: defaultRef.num,
        gen: defaultRef.gen,
        body: rewriteDictBuffer(reader.bytes, span.start, edits, []),
      });
    } else {
      updates.push({
        num: defaultRef.num,
        gen: defaultRef.gen,
        body: rebuildDict(
          reader,
          await reader.resolveValue({ kind: "ref", ref: defaultRef }),
          edits,
        ),
      });
    }
  } else {
    // No indirect default config: add one and point /OCProperties at it.
    const newNum = reader.maxObjectNum + 1;
    updates.push({
      num: newNum,
      gen: 0,
      body: rebuildDict(reader, defaultEntry, edits),
    });
    const replacement = `${newNum} 0 R`;
    if (ocPropertiesEntry?.kind === "ref") {
      const span = await reader.getRawSpan(ocPropertiesEntry.ref.num);
      if (span && !span.inStream && span.buffer === reader.bytes) {
        updates.push({
          num: ocPropertiesEntry.ref.num,
          gen: ocPropertiesEntry.ref.gen,
          body: rewriteDictBuffer(
            reader.bytes,
            span.start,
            new Map([["D", replacement]]),
            [],
          ),
        });
      } else {
        throw new PdfStructureError("cannot rewrite OCProperties");
      }
    } else {
      // A direct /OCProperties dict can only be reached through the catalog.
      const newOcProps = reader.maxObjectNum + 2;
      updates.push({
        num: newOcProps,
        gen: 0,
        body: rebuildDict(reader, ocProperties, new Map([["D", replacement]])),
      });
      const catalogSpan = await reader.getRawSpan(reader.root.num);
      if (
        !catalogSpan ||
        catalogSpan.inStream ||
        catalogSpan.buffer !== reader.bytes
      ) {
        throw new PdfStructureError("cannot rewrite the catalog");
      }
      updates.push({
        num: reader.root.num,
        gen: reader.root.gen,
        body: rewriteDictBuffer(
          reader.bytes,
          catalogSpan.start,
          new Map([["OCProperties", `${newOcProps} 0 R`]]),
          [],
        ),
      });
    }
  }

  const size =
    Math.max(reader.maxObjectNum, ...updates.map((update) => update.num)) + 1;
  return appendIncrementalUpdate(reader.bytes, updates, {
    size,
    root: reader.root,
    prev: reader.startxrefOffset,
    id: reader.trailerId,
  });
}

/**
 * Rebuilds a dict from parsed values when it cannot be spliced in place (it
 * lives in an object stream, or it has to be constructed from scratch). Keys
 * holding strings from an encrypted document are dropped: strings are
 * encrypted per object number, and a rebuilt object cannot reuse them.
 */
function rebuildDict(
  reader: PdfFileReader,
  source: PdfValue | undefined,
  edits: Map<string, string | null>,
): string {
  const entries =
    source?.kind === "dict" ? source.map : new Map<string, PdfValue>();
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const [key, value] of entries) {
    seen.add(key);
    const edit = edits.get(key);
    if (edit === null) continue;
    if (edit !== undefined) {
      parts.push(`${nameValue(key)} ${edit}`);
      continue;
    }
    if (containsEncryptedString(value, reader.encrypted)) continue;
    parts.push(`${nameValue(key)} ${serializeValue(value)}`);
  }
  for (const [key, edit] of edits) {
    if (edit && !seen.has(key)) parts.push(`${nameValue(key)} ${edit}`);
  }
  return "<<" + (parts.length > 0 ? " " + parts.join(" ") + " " : "") + ">>";
}

/**
 * Collects all leaf-level layer IDs (those that are actual OCGs, not synthetic groups).
 */
export function collectLeafIds(layers: LayerInfo[]): string[] {
  const ids: string[] = [];
  for (const layer of layers) {
    if (layer.children && layer.children.length > 0) {
      ids.push(...collectLeafIds(layer.children));
    } else {
      ids.push(layer.id);
    }
  }
  return ids;
}
