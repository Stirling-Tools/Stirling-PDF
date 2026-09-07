export interface LayerInfo {
  id: string;
  name: string;
  visible: boolean;
  children?: LayerInfo[];
}

function decodePdfString(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    const hex = trimmed.slice(1, -1).replace(/\s+/g, "");
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      let res = "";
      for (let i = 2; i < bytes.length; i += 2) {
        res += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
      }
      return res;
    }
    return new TextDecoder("latin1").decode(bytes);
  }
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    const content = trimmed.slice(1, -1);
    if (content.startsWith("\xfe\xff")) {
      let res = "";
      for (let i = 2; i < content.length; i += 2) {
        res += String.fromCharCode(
          (content.charCodeAt(i) << 8) | content.charCodeAt(i + 1),
        );
      }
      return res;
    }
    return content.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, esc) => {
      if (esc === "n") return "\n";
      if (esc === "r") return "\r";
      if (esc === "t") return "\t";
      if (esc === "b") return "\b";
      if (esc === "f") return "\f";
      if (esc === "(" || esc === ")" || esc === "\\") return esc;
      return String.fromCharCode(parseInt(esc, 8));
    });
  }
  return trimmed.replace(/^\//, "");
}

async function decompressFlate(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== "undefined") {
    const ds = new DecompressionStream("deflate");
    const writer = ds.writable.getWriter();
    writer.write(data as unknown as BufferSource);
    writer.close();
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
  return data;
}

function parseOrderTokens(
  str: string,
  ocgMap: Map<string, LayerInfo>,
): LayerInfo[] {
  const tokenRegex = /(\[|\]|\d+\s+\d+\s+R|\([^)]*\)|<[^>]*>)/g;
  const tokens = str.match(tokenRegex) || [];
  let i = 0;

  function parseList(): LayerInfo[] {
    const items: LayerInfo[] = [];
    while (i < tokens.length) {
      const token = tokens[i++];
      if (token === "]") break;
      if (token === "[") {
        const sub = parseList();
        if (sub.length > 0) items.push(...sub);
      } else if (token.endsWith("R")) {
        const objNum = token.split(/\s+/)[0];
        const ocg = ocgMap.get(objNum);
        if (ocg) items.push(ocg);
      } else if (token.startsWith("(") || token.startsWith("<")) {
        const groupName = decodePdfString(token);
        if (i < tokens.length && tokens[i] === "[") {
          i++;
          const children = parseList();
          if (children.length > 0) {
            items.push({
              id: `group-${groupName}`,
              name: groupName,
              visible: children.every((c) => c.visible),
              children,
            });
          }
        }
      }
    }
    return items;
  }

  return parseList();
}

export async function readPdfLayers(file: Blob): Promise<LayerInfo[]> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const text = new TextDecoder("latin1").decode(bytes);

  if (!text.includes("/OCProperties")) {
    return [];
  }

  const objects = new Map<string, string>();

  const objRegex = /(\d+)\s+\d+\s+obj\s*<<([^]*?)>>/g;
  for (const match of text.matchAll(objRegex)) {
    objects.set(match[1], match[2]);
  }

  const objStmRegex =
    /(\d+)\s+\d+\s+obj\s*<<([^>]*?\/Type\s*\/ObjStm[^]*?)>>\s*stream[\r\n]+/g;
  for (const m of text.matchAll(objStmRegex)) {
    const dict = m[2];
    const n = parseInt(dict.match(/\/N\s+(\d+)/)?.[1] || "0", 10);
    const first = parseInt(dict.match(/\/First\s+(\d+)/)?.[1] || "0", 10);
    const len = parseInt(dict.match(/\/Length\s+(\d+)/)?.[1] || "0", 10);
    const streamStart = (m.index ?? 0) + m[0].length;
    const compressed = bytes.subarray(
      streamStart,
      len > 0 ? streamStart + len : undefined,
    );
    try {
      const decompressedBytes = await decompressFlate(compressed);
      const decompressed = new TextDecoder("latin1").decode(decompressedBytes);
      const header = decompressed.substring(0, first).trim().split(/\s+/);
      for (let i = 0; i < n * 2; i += 2) {
        const objNum = header[i];
        const start = first + parseInt(header[i + 1], 10);
        const nextStart =
          i + 3 < header.length
            ? first + parseInt(header[i + 3], 10)
            : decompressed.length;
        objects.set(objNum, decompressed.substring(start, nextStart).trim());
      }
    } catch {
      // Stream decompression failure falls through to uncompressed object entries
    }
  }

  let ocPropsBody = "";
  const ocPropsRef = text.match(/\/OCProperties\s+(\d+)\s+\d+\s+R/);
  if (ocPropsRef) {
    ocPropsBody = objects.get(ocPropsRef[1]) || "";
  } else {
    const inlineMatch = text.match(/\/OCProperties\s*<<([^]*?)>>/);
    if (inlineMatch) ocPropsBody = inlineMatch[1];
  }

  let dBody = "";
  const dRef = ocPropsBody.match(/\/D\s+(\d+)\s+\d+\s+R/);
  if (dRef) {
    dBody = objects.get(dRef[1]) || "";
  } else {
    const dInline = ocPropsBody.match(/\/D\s*<<([^]*?)>>/);
    if (dInline) dBody = dInline[1];
  }

  const baseStateMatch = dBody.match(/\/BaseState\s*\/([A-Za-z]+)/);
  const baseState = baseStateMatch ? baseStateMatch[1] : "ON";

  const onRefs = new Set<string>();
  const onMatch = dBody.match(/\/ON\s*\[([^\]]*)\]/);
  if (onMatch) {
    for (const m of onMatch[1].matchAll(/(\d+)\s+\d+\s+R/g)) onRefs.add(m[1]);
  }

  const offRefs = new Set<string>();
  const offMatch = dBody.match(/\/OFF\s*\[([^\]]*)\]/);
  if (offMatch) {
    for (const m of offMatch[1].matchAll(/(\d+)\s+\d+\s+R/g)) offRefs.add(m[1]);
  }

  const ocgMap = new Map<string, LayerInfo>();
  for (const [id, body] of objects.entries()) {
    if (body.includes("/Type /OCG") || body.includes("/Type/OCG")) {
      const nameMatch = body.match(
        /\/Name\s*(\([^)]*\)|<[^>]*>|\/[^\s()<>[\]]+)/,
      );
      const name = nameMatch ? decodePdfString(nameMatch[1]) : `Layer ${id}`;
      const visible = baseState === "OFF" ? onRefs.has(id) : !offRefs.has(id);
      ocgMap.set(id, { id: `${id} 0 R`, name, visible });
    }
  }

  if (ocgMap.size === 0) return [];

  const orderMatch = dBody.match(/\/Order\s*\[([^\]]*)\]/);
  if (orderMatch) {
    const ordered = parseOrderTokens(orderMatch[1], ocgMap);
    if (ordered.length > 0) return ordered;
  }

  return Array.from(ocgMap.values());
}

/**
 * Modifies OCG visibility in a PDF using @cantoo/pdf-lib.
 * Accepts a flat map of { layerName -> visible } and rewrites the /D config.
 *
 * Strategy: set /BaseState to /OFF and only list visible layers in /ON.
 * This is the most unambiguous approach and avoids conflicts between
 * /BaseState, /ON, and /OFF that can confuse some viewers.
 * Also removes /AS (auto-state) entries that can override visibility.
 */
export async function applyOCGVisibilityToPdf(
  pdfBytes: ArrayBuffer,
  layerVisibility: Record<string, boolean>,
): Promise<Uint8Array> {
  const { PDFDocument, PDFDict, PDFName, PDFArray, PDFString, PDFHexString } =
    await import("@cantoo/pdf-lib");

  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const context = doc.context;

  // Access the catalog via the trailer's Root reference
  const catalogRef = context.trailerInfo.Root;
  const catalog = context.lookup(
    catalogRef,
  ) as unknown as typeof PDFDict.prototype;

  // Get OCProperties dict (may be a direct dict or an indirect reference)
  const ocPropsRaw = (catalog as any).lookup(PDFName.of("OCProperties"));
  if (!ocPropsRaw) {
    return doc.save();
  }
  const ocProps = (ocPropsRaw instanceof PDFDict
    ? ocPropsRaw
    : context.lookup(ocPropsRaw)) as unknown as typeof PDFDict.prototype;

  // Get the /OCGs array
  const ocgsRaw = (ocProps as any).lookup(PDFName.of("OCGs"));
  if (!(ocgsRaw instanceof PDFArray)) {
    return doc.save();
  }
  const ocgsArray = ocgsRaw as unknown as typeof PDFArray.prototype;

  // Get or create the /D (default config) dict
  const dRaw = (ocProps as any).lookup(PDFName.of("D"));
  if (!dRaw) {
    return doc.save();
  }
  const dDict = (dRaw instanceof PDFDict
    ? dRaw
    : context.lookup(dRaw)) as unknown as typeof PDFDict.prototype;

  // Collect OCG refs for ON vs OFF based on user visibility settings
  const onRefs: any[] = [];
  const offRefs: any[] = [];

  const size = (ocgsArray as any).size() as number;
  for (let i = 0; i < size; i++) {
    const ocgRef = (ocgsArray as any).get(i);
    const ocgDict = context.lookup(
      ocgRef,
    ) as unknown as typeof PDFDict.prototype;
    if (!ocgDict) continue;

    // Get the OCG name
    const nameRaw = (ocgDict as any).lookup(PDFName.of("Name"));
    let ocgName = "";
    if (nameRaw instanceof PDFString || nameRaw instanceof PDFHexString) {
      ocgName =
        (nameRaw as any).decodeText?.() ?? (nameRaw as any).asString?.() ?? "";
    } else if (nameRaw) {
      ocgName = String(nameRaw);
    }

    // Look up visibility by name
    const shouldBeVisible = layerVisibility[ocgName] ?? true;

    if (shouldBeVisible) {
      onRefs.push(ocgRef);
    } else {
      offRefs.push(ocgRef);
    }
  }

  // Set /BaseState to /OFF so all layers start hidden, then /ON lists visible ones.
  // This is unambiguous and avoids conflicts between /BaseState and /ON//OFF.
  (dDict as any).set(PDFName.of("BaseState"), PDFName.of("OFF"));

  // Set /ON to only the visible layers
  if (onRefs.length > 0) {
    (dDict as any).set(PDFName.of("ON"), context.obj(onRefs));
  } else {
    (dDict as any).delete?.(PDFName.of("ON"));
  }

  // Set /OFF to only the hidden layers (for viewers that check it)
  if (offRefs.length > 0) {
    (dDict as any).set(PDFName.of("OFF"), context.obj(offRefs));
  } else {
    (dDict as any).delete?.(PDFName.of("OFF"));
  }

  // Remove /AS (auto-state) array — it can contain usage-based overrides
  // (e.g., print vs view) that conflict with our explicit visibility settings.
  (dDict as any).delete?.(PDFName.of("AS"));

  return doc.save();
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
