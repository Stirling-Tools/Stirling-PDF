/**
 * Reads the AcroForm field tree with the in-repo PDF reader: for each fully
 * qualified field name, the /Opt option values of choice fields and the
 * /MK/CA label plus /A, /AA /U action of push buttons. PDFium exposes neither,
 * so the form provider enriches its field list with this.
 */
import type { ButtonAction } from "@app/tools/formFill/types";
import { PdfFileReader } from "@app/utils/pdfObjectReader";
import type { PdfValue } from "@app/utils/pdfObjectReader";

export interface AcroFormFieldInfo {
  exportValues?: string[];
  displayValues?: string[];
  label?: string;
  action?: ButtonAction;
}

const MAX_FIELD_DEPTH = 32;

const textOf = async (
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

const actionOf = async (
  reader: PdfFileReader,
  value: PdfValue | undefined,
): Promise<ButtonAction | null> => {
  const action = asDict(await reader.resolveValue(value));
  if (!action) return null;
  const type = await textOf(reader, action.get("S"));
  switch (type) {
    case "Named":
      return {
        type: "named",
        namedAction: (await textOf(reader, action.get("N"))) ?? "",
      };
    case "JavaScript":
      return {
        type: "javascript",
        javascript: (await textOf(reader, action.get("JS"))) ?? "",
      };
    case "SubmitForm": {
      const target = await reader.resolveValue(action.get("F"));
      const targetMap = target?.kind === "dict" ? target.map : undefined;
      const url =
        (targetMap
          ? await textOf(reader, targetMap.get("F"))
          : await textOf(reader, target)) ?? "";
      const flags = await reader.resolveValue(action.get("Flags"));
      return {
        type: "submitForm",
        url,
        submitFlags: flags?.kind === "number" ? flags.value : 0,
      };
    }
    case "ResetForm":
      return { type: "resetForm" };
    case "URI":
      return {
        type: "uri",
        url: (await textOf(reader, action.get("URI"))) ?? "",
      };
    default:
      return null;
  }
};

const mkCaptionOf = async (
  reader: PdfFileReader,
  dict: Map<string, PdfValue>,
): Promise<string | null> => {
  try {
    const mk = asDict(await reader.resolveValue(dict.get("MK")));
    return mk ? await textOf(reader, mk.get("CA")) : null;
  } catch {
    return null;
  }
};

/** /Opt (ISO 32000-1 12.7.4.4): entries are strings or [export, display] pairs. */
const optionsOf = async (
  reader: PdfFileReader,
  dict: Map<string, PdfValue>,
): Promise<{ exportValues: string[]; displayValues: string[] } | null> => {
  const opt = await reader.resolveValue(dict.get("Opt"));
  if (opt?.kind !== "array" || opt.items.length === 0) return null;
  const exportValues: string[] = [];
  const displayValues: string[] = [];
  let hasDifference = false;
  for (const item of opt.items) {
    try {
      const resolved = await reader.resolveValue(item);
      if (resolved?.kind === "array" && resolved.items.length >= 2) {
        const exported = (await textOf(reader, resolved.items[0])) ?? "";
        const displayed = (await textOf(reader, resolved.items[1])) ?? "";
        exportValues.push(exported);
        displayValues.push(displayed);
        if (exported !== displayed) hasDifference = true;
      } else {
        const value = (await textOf(reader, resolved)) ?? "";
        exportValues.push(value);
        displayValues.push(value);
      }
    } catch {
      continue;
    }
  }
  if (exportValues.length === 0) return null;
  return {
    exportValues,
    displayValues: hasDifference ? displayValues : exportValues,
  };
};

const collectFields = async (
  reader: PdfFileReader,
  fields: PdfValue[],
  parentName: string,
  into: Map<string, AcroFormFieldInfo>,
  depth: number,
  seen: Set<Map<string, PdfValue>> = new Set(),
): Promise<void> => {
  if (depth > MAX_FIELD_DEPTH) return;
  for (const entry of fields) {
    const field = asDict(await reader.resolveValue(entry));
    if (!field || seen.has(field)) continue;
    seen.add(field);
    const partial = await textOf(reader, field.get("T"));
    const name =
      parentName && partial
        ? `${parentName}.${partial}`
        : (partial ?? parentName);

    const kids = await reader.resolveValue(field.get("Kids"));
    const childFields: PdfValue[] = [];
    const widgets: Array<Map<string, PdfValue>> = [];
    if (kids?.kind === "array") {
      for (const kid of kids.items) {
        const kidMap = asDict(await reader.resolveValue(kid));
        if (!kidMap) continue;
        if (kidMap.has("T")) {
          childFields.push((await reader.resolveValue(kid)) ?? kid);
        } else {
          widgets.push(kidMap);
        }
      }
    }

    const info: AcroFormFieldInfo = {};
    const options = await optionsOf(reader, field);
    if (options) {
      info.exportValues = options.exportValues;
      info.displayValues = options.displayValues;
    }

    // Widget dicts first (each widget can carry its own /MK and /A), then the
    // field dict, then /AA /U.
    for (const widget of widgets) {
      if (!info.label)
        info.label = (await mkCaptionOf(reader, widget)) ?? undefined;
      if (!info.action) {
        info.action = (await actionOf(reader, widget.get("A"))) ?? undefined;
      }
      if (info.label && info.action) break;
    }
    if (!info.label)
      info.label = (await mkCaptionOf(reader, field)) ?? undefined;
    if (!info.action) {
      info.action = (await actionOf(reader, field.get("A"))) ?? undefined;
    }
    if (!info.action) {
      const aa = asDict(await reader.resolveValue(field.get("AA")));
      if (aa) info.action = (await actionOf(reader, aa.get("U"))) ?? undefined;
    }

    if (name && (info.exportValues || info.label || info.action)) {
      into.set(name, info);
    }

    if (childFields.length > 0) {
      await collectFields(reader, childFields, name, into, depth + 1, seen);
    }
  }
};

/** Field info keyed by fully qualified name; empty when the file has no AcroForm. */
export async function readAcroFormFieldInfo(
  bytes: ArrayBuffer,
): Promise<Map<string, AcroFormFieldInfo>> {
  const into = new Map<string, AcroFormFieldInfo>();
  const reader = await PdfFileReader.open(new Uint8Array(bytes));
  const catalog = await reader.resolveValue(
    reader.root ? { kind: "ref", ref: reader.root } : undefined,
  );
  if (catalog?.kind !== "dict") return into;
  const acroForm = asDict(
    await reader.resolveValue(catalog.map.get("AcroForm")),
  );
  if (!acroForm) return into;
  const fields = await reader.resolveValue(acroForm.get("Fields"));
  if (fields?.kind !== "array") return into;
  await collectFields(reader, fields.items, "", into, 0);
  return into;
}
