export interface LayerInfo {
  id: string;
  name: string;
  visible: boolean;
  children?: LayerInfo[];
}

/**
 * Reads OCG layer info from a PDF file using pdfjs-dist.
 * Returns a flat list of all OCG groups with their names and default visibility.
 */
export async function readPdfLayers(file: Blob): Promise<LayerInfo[]> {
  const { getDocument, GlobalWorkerOptions } =
    await import("pdfjs-dist/legacy/build/pdf.mjs");

  if (!GlobalWorkerOptions.workerSrc) {
    GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = getDocument({ data: arrayBuffer, verbosity: 0 });
  const pdfDoc = await loadingTask.promise;

  try {
    const ocConfig = await pdfDoc.getOptionalContentConfig();

    if (!ocConfig) return [];

    // pdfjs v5 uses [Symbol.iterator] and getGroup(id), not getGroups()
    const groups: Record<string, any> = {};
    for (const [id, group] of ocConfig as any) {
      groups[id] = group;
    }
    if (Object.keys(groups).length === 0) return [];

    // Use getOrder() for hierarchical display
    let order: any[] | null = null;
    try {
      order = ocConfig.getOrder?.() ?? null;
    } catch {
      // getOrder not available
    }

    if (order && Array.isArray(order) && order.length > 0) {
      return buildLayerTree(order, groups);
    }

    // Fallback: flat list in enumeration order
    return Object.entries(groups).map(([id, group]) => ({
      id,
      name: (group as any).name ?? id,
      visible: (group as any).visible ?? true,
    }));
  } finally {
    await pdfDoc.destroy();
  }
}

/**
 * Recursively builds a LayerInfo tree from pdfjs OCG order array.
 * The order array can contain:
 *  - string: an OCG id
 *  - { name: string, order: any[] }: a named group with children
 *  - array: a nested group
 */
function buildLayerTree(
  order: any[],
  groups: Record<string, any>,
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
          name: (group as any).name ?? item,
          visible: (group as any).visible ?? true,
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
        order?: any[];
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
