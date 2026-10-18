import type { PDFObject } from "@cantoo/pdf-lib";

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

/**
 * Reads OCG layer info from a PDF by walking /OCProperties with pdf-lib.
 * Workerless on purpose: the viewer renders through PDFium, so pulling in the
 * pdf.js worker just for layers would download it when the panel opens.
 * Unlike a byte scan, pdf-lib resolves catalogs stored in object streams.
 */
export async function readPdfLayers(file: Blob): Promise<LayerInfo[]> {
  const {
    PDFDocument,
    PDFDict,
    PDFArray,
    PDFName,
    PDFString,
    PDFHexString,
    PDFRef,
  } = await import("@cantoo/pdf-lib");

  const textOf = (value: PDFObject | undefined): string | undefined => {
    if (value instanceof PDFString || value instanceof PDFHexString) {
      return value.decodeText();
    }
    if (value instanceof PDFName) return value.decodeText();
    return undefined;
  };

  const refIdSet = (value: PDFObject | undefined): Set<string> => {
    const result = new Set<string>();
    if (value instanceof PDFArray) {
      for (let i = 0; i < value.size(); i++) {
        const entry = value.get(i);
        if (entry instanceof PDFRef) result.add(entry.toString());
      }
    }
    return result;
  };

  // Normalizes /D/Order into the shape buildLayerTree consumes: OCG ids,
  // nested arrays, and {name, order} nodes for named groups.
  const normalizeOrder = (
    value: PDFObject | undefined,
    depth = 0,
  ): unknown[] => {
    if (!(value instanceof PDFArray) || depth > MAX_ORDER_DEPTH) return [];
    const result: unknown[] = [];
    for (let i = 0; i < value.size(); i++) {
      const entry = value.get(i);
      const resolved = doc.context.lookup(entry);
      if (entry instanceof PDFRef) {
        if (resolved instanceof PDFArray) {
          result.push(normalizeOrder(resolved, depth + 1));
        } else if (
          resolved instanceof PDFDict &&
          resolved.has(PDFName.of("Order"))
        ) {
          result.push({
            name: textOf(resolved.lookup(PDFName.of("Name"))),
            order: normalizeOrder(
              resolved.lookup(PDFName.of("Order")),
              depth + 1,
            ),
          });
        } else {
          result.push(entry.toString());
        }
      } else if (resolved instanceof PDFArray) {
        result.push(normalizeOrder(resolved, depth + 1));
      } else if (resolved instanceof PDFDict) {
        result.push({
          name: textOf(resolved.lookup(PDFName.of("Name"))),
          order: normalizeOrder(resolved.lookup(PDFName.of("Order")), depth + 1),
        });
      }
    }
    return result;
  };

  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const catalog = doc.context.lookup(doc.context.trailerInfo.Root);
  if (!(catalog instanceof PDFDict)) return [];

  const ocProperties = doc.context.lookup(
    catalog.get(PDFName.of("OCProperties")),
  );
  if (!(ocProperties instanceof PDFDict)) return [];

  const ocgs = doc.context.lookup(ocProperties.get(PDFName.of("OCGs")));
  if (!(ocgs instanceof PDFArray)) return [];

  const groups: Record<string, OcGroup> = {};
  const ids: string[] = [];
  for (let i = 0; i < ocgs.size(); i++) {
    const ref = ocgs.get(i);
    if (!(ref instanceof PDFRef)) continue;
    const id = ref.toString();
    if (id in groups) continue;
    const dict = doc.context.lookup(ref);
    if (!(dict instanceof PDFDict)) continue;
    groups[id] = { name: textOf(dict.lookup(PDFName.of("Name"))) };
    ids.push(id);
  }
  if (ids.length === 0) return [];

  const defaultConfigRaw = doc.context.lookup(
    ocProperties.get(PDFName.of("D")),
  );
  const defaultConfig =
    defaultConfigRaw instanceof PDFDict ? defaultConfigRaw : null;
  // `lookup` rather than `get`: a PDF may store these entries as indirect refs.
  const onIds = refIdSet(defaultConfig?.lookup(PDFName.of("ON")));
  const offIds = refIdSet(defaultConfig?.lookup(PDFName.of("OFF")));
  const baseState = textOf(defaultConfig?.lookup(PDFName.of("BaseState")));
  for (const id of ids) {
    // pdf.js starts from /BaseState and then applies /ON, then /OFF, so an id
    // listed in both /ON and /OFF stays hidden.
    groups[id].visible = offIds.has(id)
      ? false
      : onIds.has(id)
        ? true
        : baseState !== "OFF";
  }

  const order = normalizeOrder(defaultConfig?.lookup(PDFName.of("Order")));
  if (order.length > 0) {
    return buildLayerTree(order, groups);
  }

  return ids.map((id) => ({
    id,
    name: groups[id].name ?? id,
    visible: groups[id].visible ?? true,
  }));
}

/**
 * Recursively builds a LayerInfo tree from a normalized /D/Order array.
 * Entries are: a string (an OCG id), an array (nested group), or
 * { name, order } (named group with children).
 */
function buildLayerTree(
  order: unknown[],
  groups: Record<string, OcGroup>,
  visited = new Set<string>(),
): LayerInfo[] {
  const result: LayerInfo[] = [];

  for (const item of order) {
    if (typeof item === "string") {
      // It's an OCG id
      if (visited.has(item)) continue;
      visited.add(item);
      const group = groups[item];
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
        // Use the first child's id as a synthetic group id
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
  const catalog = context.lookup(context.trailerInfo.Root);
  if (!(catalog instanceof PDFDict)) {
    return doc.save();
  }

  // Get OCProperties dict (may be a direct dict or an indirect reference)
  const ocPropsRaw = catalog.lookup(PDFName.of("OCProperties"));
  if (!ocPropsRaw) {
    return doc.save();
  }
  const ocProps =
    ocPropsRaw instanceof PDFDict ? ocPropsRaw : context.lookup(ocPropsRaw);
  if (!(ocProps instanceof PDFDict)) {
    return doc.save();
  }

  // Get the /OCGs array
  const ocgsArray = ocProps.lookup(PDFName.of("OCGs"));
  if (!(ocgsArray instanceof PDFArray)) {
    return doc.save();
  }

  // Get or create the /D (default config) dict
  const dRaw = ocProps.lookup(PDFName.of("D"));
  if (!dRaw) {
    return doc.save();
  }
  const dDict = dRaw instanceof PDFDict ? dRaw : context.lookup(dRaw);
  if (!(dDict instanceof PDFDict)) {
    return doc.save();
  }

  // Collect OCG refs for ON vs OFF based on user visibility settings
  const onRefs: PDFObject[] = [];
  const offRefs: PDFObject[] = [];

  const size = ocgsArray.size();
  for (let i = 0; i < size; i++) {
    const ocgRef = ocgsArray.get(i);
    const ocgDict = context.lookup(ocgRef);
    if (!(ocgDict instanceof PDFDict)) continue;

    // Get the OCG name
    const nameRaw = ocgDict.lookup(PDFName.of("Name"));
    let ocgName = "";
    if (nameRaw instanceof PDFString || nameRaw instanceof PDFHexString) {
      ocgName = nameRaw.decodeText();
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
  dDict.set(PDFName.of("BaseState"), PDFName.of("OFF"));

  // Set /ON to only the visible layers
  if (onRefs.length > 0) {
    dDict.set(PDFName.of("ON"), context.obj(onRefs));
  } else {
    dDict.delete(PDFName.of("ON"));
  }

  // Set /OFF to only the hidden layers (for viewers that check it)
  if (offRefs.length > 0) {
    dDict.set(PDFName.of("OFF"), context.obj(offRefs));
  } else {
    dDict.delete(PDFName.of("OFF"));
  }

  // Remove /AS (auto-state) array - it can contain usage-based overrides
  // (e.g., print vs view) that conflict with our explicit visibility settings.
  dDict.delete(PDFName.of("AS"));

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
