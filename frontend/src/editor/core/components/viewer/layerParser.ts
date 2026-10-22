import {
  PdfFileReader,
  type PdfRef,
  type PdfValue,
} from "@app/utils/pdfObjectReader";

export interface LayerInfo {
  id: string;
  name: string;
  visible: boolean;
  children?: LayerInfo[];
}

// The fields read off each OCG dictionary.
interface OcGroup {
  name?: string;
  visible?: boolean;
}

// Bounds recursion into /Order trees whose arrays nest deeply or reach
// themselves again through an object stream.
const MAX_ORDER_DEPTH = 64;

export interface LayerParseRequest {
  blob: Blob;
}

export type LayerParseResponse = { layers: LayerInfo[] } | { error: string };

function refId(ref: PdfRef): string {
  return `${ref.num} ${ref.gen} R`;
}

/**
 * Reads OCG layer info by walking /OCProperties. Runs inside the layer parse
 * worker: parsing a large document costs real CPU, so the main thread never
 * does it. The reader resolves catalogs stored in object streams, unlike a
 * byte scan, and decrypts owner-password-only files the way the sidebar has
 * always accepted them.
 */
export async function extractLayers(
  bytes: ArrayBuffer | Uint8Array,
): Promise<LayerInfo[]> {
  const reader = await PdfFileReader.open(
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
  );

  const textOf = async (
    value: PdfValue | undefined,
  ): Promise<string | undefined> => {
    const resolved = await reader.resolveValue(value);
    if (resolved?.kind === "string") return await reader.stringText(resolved);
    if (resolved?.kind === "name") return resolved.name;
    return undefined;
  };

  // `resolveValue` rather than a direct get: a PDF may store these entries as
  // indirect refs, and object streams hold most real-world catalogs.
  const catalog = await reader.resolveValue(
    reader.root ? { kind: "ref", ref: reader.root } : undefined,
  );
  if (catalog?.kind !== "dict") return [];
  const ocProperties = await reader.resolveValue(
    catalog.map.get("OCProperties"),
  );
  if (ocProperties?.kind !== "dict") return [];

  const ocgs = await reader.resolveValue(ocProperties.map.get("OCGs"));
  if (ocgs?.kind !== "array") return [];

  const groups = new Map<string, OcGroup>();
  const ids: string[] = [];
  for (const item of ocgs.items) {
    if (item.kind !== "ref") continue;
    const id = refId(item.ref);
    if (groups.has(id)) continue;
    const dict = await reader.resolveValue(item);
    if (dict?.kind !== "dict") continue;
    groups.set(id, { name: await textOf(dict.map.get("Name")) });
    ids.push(id);
  }
  if (ids.length === 0) return [];

  const defaultConfig = await reader.resolveValue(ocProperties.map.get("D"));
  const defaultDict =
    defaultConfig?.kind === "dict" ? defaultConfig.map : undefined;
  const onIds = await refIdSet(reader, defaultDict?.get("ON"));
  const offIds = await refIdSet(reader, defaultDict?.get("OFF"));
  const baseState = defaultDict
    ? await textOf(defaultDict.get("BaseState"))
    : undefined;
  for (const id of ids) {
    const group = groups.get(id);
    if (!group) continue;
    // pdf.js starts from /BaseState and then applies /ON, then /OFF, so an id
    // listed in both /ON and /OFF stays hidden.
    group.visible = offIds.has(id)
      ? false
      : onIds.has(id)
        ? true
        : baseState !== "OFF";
  }

  const order = await normalizeOrder(reader, defaultDict?.get("Order"));
  if (order.length > 0) {
    return buildLayerTree(order, groups);
  }

  return ids.map((id) => ({
    id,
    name: groups.get(id)?.name ?? id,
    visible: groups.get(id)?.visible ?? true,
  }));
}

async function refIdSet(
  reader: PdfFileReader,
  value: PdfValue | undefined,
): Promise<Set<string>> {
  const result = new Set<string>();
  const resolved = await reader.resolveValue(value);
  if (resolved?.kind === "array") {
    for (const item of resolved.items) {
      if (item.kind === "ref") result.add(refId(item.ref));
    }
  }
  return result;
}

// Normalizes /D/Order into the shape buildLayerTree consumes: OCG ids, nested
// arrays, and {name, order} nodes for named groups. A labeled group is spec'd
// as an array whose first element is its text label (`[(Maps) 5 0 R ...]`);
// the {name, order} dict form is pdf.js's normalized shape and both show up in
// real files.
async function normalizeOrder(
  reader: PdfFileReader,
  value: PdfValue | undefined,
  depth = 0,
  path: ReadonlySet<number> = new Set(),
): Promise<unknown[]> {
  const resolved = await reader.resolveValue(value);
  if (resolved?.kind !== "array" || depth > MAX_ORDER_DEPTH) return [];

  let label: string | undefined;
  let start = 0;
  if (resolved.items.length > 0) {
    const first = await reader.resolveValue(resolved.items[0]);
    if (first?.kind === "string") {
      label = await reader.stringText(first);
      start = 1;
    }
  }

  const dictNode = async (
    dict: PdfValue & { kind: "dict" },
    nextPath: ReadonlySet<number>,
  ): Promise<unknown> => ({
    name: await stringTextOf(reader, dict.map.get("Name")),
    order: await normalizeOrder(
      reader,
      dict.map.get("Order"),
      depth + 1,
      nextPath,
    ),
  });

  const result: unknown[] = [];
  for (let i = start; i < resolved.items.length; i++) {
    const entry = resolved.items[i];
    if (entry.kind === "ref" && path.has(entry.ref.num)) continue;
    const nextPath =
      entry.kind === "ref" ? new Set(path).add(entry.ref.num) : path;
    const target = await reader.resolveValue(entry);
    if (entry.kind === "ref") {
      if (target?.kind === "array") {
        result.push(await normalizeOrder(reader, target, depth + 1, nextPath));
      } else if (target?.kind === "dict" && target.map.has("Order")) {
        result.push(await dictNode(target, nextPath));
      } else {
        result.push(refId(entry.ref));
      }
    } else if (target?.kind === "array") {
      result.push(await normalizeOrder(reader, target, depth + 1, path));
    } else if (target?.kind === "dict") {
      result.push(await dictNode(target, path));
    }
  }
  return label === undefined ? result : [{ name: label, order: result }];
}

async function stringTextOf(
  reader: PdfFileReader,
  value: PdfValue | undefined,
): Promise<string | undefined> {
  const resolved = await reader.resolveValue(value);
  if (resolved?.kind === "string") return await reader.stringText(resolved);
  return undefined;
}

/**
 * Recursively builds a LayerInfo tree from a normalized /D/Order array.
 * Entries are: a string (an OCG id), an array (nested group), or
 * { name, order } (named group with children).
 */
function buildLayerTree(
  order: unknown[],
  groups: Map<string, OcGroup>,
  visited = new Set<string>(),
): LayerInfo[] {
  const result: LayerInfo[] = [];

  for (const item of order) {
    if (typeof item === "string") {
      // It's an OCG id
      if (visited.has(item)) continue;
      visited.add(item);
      const group = groups.get(item);
      if (group) {
        result.push({
          id: item,
          name: group.name ?? item,
          visible: group.visible ?? true,
        });
      }
    } else if (Array.isArray(item)) {
      // Nested group (unlabeled)
      const children = buildLayerTree(item, groups, visited);
      result.push(...children);
    } else if (item && typeof item === "object") {
      // Named group with nested items
      const { name, order: subOrder } = item as {
        name?: string;
        order?: unknown[];
      };
      const children = subOrder
        ? buildLayerTree(subOrder, groups, visited)
        : [];
      if (name && children.length > 0) {
        // Use the name as the synthetic group id
        result.push({
          id: `group-${name}`,
          name: name,
          visible: children.every((c) => c.visible),
          children,
        });
      } else {
        result.push(...children);
      }
    }
  }

  return result;
}
