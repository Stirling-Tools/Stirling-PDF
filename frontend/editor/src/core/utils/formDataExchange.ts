/**
 * XFDF and FDF form-data exchange.
 *
 * These are Acrobat's two interchange formats for the *values* of a PDF form,
 * separate from the document itself. They are what a "submit form" button
 * posts, what "Export Data" writes, and what most enterprise form pipelines
 * hand around - so reading and writing them is the difference between
 * inheriting an Acrobat forms workflow and having to rebuild it.
 *
 * **XFDF** (ISO 19444-1) is XML:
 *
 *   <xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">
 *     <f href="form.pdf"/>
 *     <fields>
 *       <field name="Name"><value>Ada</value></field>
 *       <field name="Address">
 *         <field name="Street"><value>1 High St</value></field>
 *       </field>
 *     </fields>
 *   </xfdf>
 *
 * Nested `<field>` elements build a dotted fully-qualified name
 * (`Address.Street`), matching how PDF names hierarchical fields. A field
 * with several `<value>` children is a multi-select list box.
 *
 * **FDF** is PDF object syntax:
 *
 *   %FDF-1.2
 *   1 0 obj << /FDF << /Fields [ << /T (Name) /V (Ada) >> ] /F (form.pdf) >> >>
 *   endobj
 *
 * with `/Kids` for hierarchy and `/V` holding the value - a string for text
 * fields, a name for checkboxes and radio groups.
 */

import {
  psArray,
  psDict,
  psName,
  PsName,
  PsRef,
  readObjects,
  type PsDict,
  type PsValue,
} from "@app/utils/postscriptObjects";

export type FormDataFormat = "xfdf" | "fdf";

export interface FormDataImport {
  format: FormDataFormat;
  /**
   * Field values keyed by fully-qualified name. Multi-select values are
   * comma-joined, matching how the form store holds them.
   */
  values: Record<string, string>;
  /** `<f href>` / `/F` - the PDF the data was exported from, if declared. */
  pdfHref?: string;
}

/** Join a hierarchical field path the way PDF fully-qualified names do. */
const qualify = (path: string[]): string => path.join(".");

// ---------------------------------------------------------------------------
// XFDF
// ---------------------------------------------------------------------------

const XFDF_NS = "http://ns.adobe.com/xfdf/";

/**
 * Parse XFDF text into field values.
 *
 * @throws if the text is not well-formed XML or has no `<xfdf>` root.
 */
export function parseXfdf(xmlText: string): FormDataImport {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");

  // DOMParser signals XML syntax errors with a <parsererror> node.
  const parserError = doc.getElementsByTagName("parsererror")[0];
  if (parserError) {
    throw new Error(
      `File is not valid XML: ${parserError.textContent?.trim().split("\n")[0] ?? "unknown error"}`,
    );
  }

  const root = doc.documentElement;
  if (!root || root.localName !== "xfdf") {
    throw new Error("Not an XFDF file: expected an <xfdf> root element.");
  }

  const values: Record<string, string> = {};

  const walk = (container: Element, path: string[]): void => {
    for (const child of Array.from(container.children)) {
      if (child.localName !== "field") continue;
      const name = child.getAttribute("name");
      if (!name) continue;
      const nextPath = [...path, name];

      // A field is either a leaf holding <value>s or a branch holding
      // more <field>s. Adobe permits both, so collect values first.
      const valueNodes = Array.from(child.children).filter(
        (node) => node.localName === "value",
      );
      if (valueNodes.length > 0) {
        // xml:space="preserve" is the XFDF default; never trim.
        values[qualify(nextPath)] = valueNodes
          .map((node) => node.textContent ?? "")
          .join(",");
      }
      walk(child, nextPath);
    }
  };

  const fieldsEl = Array.from(root.children).find(
    (child) => child.localName === "fields",
  );
  if (fieldsEl) walk(fieldsEl, []);

  const fEl = Array.from(root.children).find(
    (child) => child.localName === "f",
  );
  const href = fEl?.getAttribute("href") ?? undefined;

  return { format: "xfdf", values, pdfHref: href };
}

/** True when the text looks like XFDF. */
export function looksLikeXfdf(text: string): boolean {
  const head = text.slice(0, 2048);
  return head.includes(XFDF_NS) || /<xfdf[\s>]/.test(head);
}

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

const escapeXml = (value: string): string =>
  value.replace(/[&<>"]/g, (ch) => XML_ESCAPES[ch]);

/**
 * A tree node used to rebuild the `<field>` hierarchy from dotted names on
 * export, so `Address.Street` round-trips as nested elements rather than a
 * single field literally named "Address.Street".
 */
interface FieldNode {
  children: Map<string, FieldNode>;
  values?: string[];
}

const emptyNode = (): FieldNode => ({ children: new Map() });

function buildFieldTree(
  values: Record<string, string>,
  multiSelectFields: ReadonlySet<string>,
): FieldNode {
  const root = emptyNode();
  for (const [name, value] of Object.entries(values)) {
    let node = root;
    for (const segment of name.split(".")) {
      let child = node.children.get(segment);
      if (!child) {
        child = emptyNode();
        node.children.set(segment, child);
      }
      node = child;
    }
    // Only split on commas for fields the form actually declares as
    // multi-select - a comma in an address line is not a value separator.
    node.values = multiSelectFields.has(name)
      ? value.split(",").filter((part) => part.length > 0)
      : [value];
  }
  return root;
}

function serializeFieldNode(
  name: string,
  node: FieldNode,
  indent: string,
): string {
  const lines: string[] = [`${indent}<field name="${escapeXml(name)}">`];
  for (const value of node.values ?? []) {
    lines.push(`${indent}  <value>${escapeXml(value)}</value>`);
  }
  for (const [childName, child] of node.children) {
    lines.push(serializeFieldNode(childName, child, `${indent}  `));
  }
  lines.push(`${indent}</field>`);
  return lines.join("\n");
}

export interface BuildXfdfOptions {
  /** Written as `<f href>` so Acrobat can reopen the source document. */
  pdfHref?: string;
  /**
   * Fields whose value is a comma-joined multi-selection, so they can be
   * written back out as separate `<value>` elements.
   */
  multiSelectFields?: Iterable<string>;
}

/**
 * Serialize form values as XFDF.
 *
 * The output is accepted by Acrobat's Import Data and by any XFDF-aware form
 * server, which is the point: a form filled in Stirling can be handed back to
 * an Acrobat-based process.
 */
export function buildXfdf(
  values: Record<string, string>,
  options: BuildXfdfOptions = {},
): string {
  const tree = buildFieldTree(values, new Set(options.multiSelectFields ?? []));
  const fields = Array.from(tree.children).map(([name, node]) =>
    serializeFieldNode(name, node, "    "),
  );

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">',
    ...(options.pdfHref ? [`  <f href="${escapeXml(options.pdfHref)}"/>`] : []),
    "  <fields>",
    ...fields,
    "  </fields>",
    "</xfdf>",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// FDF
// ---------------------------------------------------------------------------

/**
 * Decode a PDF text string. Strings prefixed with the UTF-16BE byte-order
 * mark carry non-Latin text; everything else is PDFDocEncoding, which is
 * close enough to latin1 for field values.
 */
function decodePdfString(raw: string): string {
  if (
    raw.length >= 2 &&
    raw.charCodeAt(0) === 0xfe &&
    raw.charCodeAt(1) === 0xff
  ) {
    let out = "";
    for (let i = 2; i + 1 < raw.length; i += 2) {
      out += String.fromCharCode(
        (raw.charCodeAt(i) << 8) | raw.charCodeAt(i + 1),
      );
    }
    return out;
  }
  return raw;
}

/**
 * Follow indirect references to their object bodies. Writers such as
 * Syncfusion emit every field as its own `N 0 obj`, so `/Fields` is an array
 * of references rather than inline dictionaries.
 */
type Resolver = (value: PsValue) => PsValue;

function makeResolver(indirect: Map<number, PsValue>): Resolver {
  return function resolve(value: PsValue): PsValue {
    const seen = new Set<number>();
    let current = value;
    while (current instanceof PsRef) {
      // A reference cycle would otherwise spin forever.
      if (seen.has(current.objectNumber)) return null;
      seen.add(current.objectNumber);
      current = indirect.get(current.objectNumber) ?? null;
    }
    return current;
  };
}

/** Render an FDF `/V` entry as the string the form store holds. */
function fdfValueToString(
  value: PsValue,
  resolve: Resolver,
): string | undefined {
  const resolved = resolve(value);
  if (typeof resolved === "string") return decodePdfString(resolved);
  // Checkboxes and radio groups store their export value as a name.
  if (resolved instanceof PsName) return resolved.name;
  if (typeof resolved === "number") return String(resolved);
  if (Array.isArray(resolved)) {
    // Multi-select list boxes hold an array of selected export values.
    const parts = resolved
      .map((item) => fdfValueToString(item, resolve))
      .filter((item): item is string => item !== undefined);
    return parts.length > 0 ? parts.join(",") : undefined;
  }
  return undefined;
}

function walkFdfFields(
  fields: PsValue[],
  path: string[],
  values: Record<string, string>,
  resolve: Resolver,
): void {
  for (const entry of fields) {
    const field = psDict(resolve(entry));
    if (!field) continue;
    const title = resolve(field.T);
    const name =
      typeof title === "string" ? decodePdfString(title) : psName(title);
    if (!name) continue;
    const nextPath = [...path, name];

    if (field.V !== undefined) {
      const value = fdfValueToString(field.V, resolve);
      if (value !== undefined) values[qualify(nextPath)] = value;
    }
    const kids = psArray(resolve(field.Kids));
    if (kids) walkFdfFields(kids, nextPath, values, resolve);
  }
}

/**
 * Decode bytes as latin1 so every byte maps to one char, preserving the
 * UTF-16 sequences inside PDF strings for {@link decodePdfString}.
 */
export function decodeLatin1(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  // Chunked to stay clear of the argument-count limit on large files.
  const CHUNK = 0x8000;
  for (let i = 0; i < view.length; i += CHUNK) {
    out += String.fromCharCode(...view.subarray(i, i + CHUNK));
  }
  return out;
}

/**
 * Parse FDF into field values.
 *
 * @param source Raw FDF bytes, or latin1-decoded text.
 * @throws if no `/FDF` dictionary with a `/Fields` array is present.
 */
export function parseFdf(
  source: ArrayBuffer | Uint8Array | string,
): FormDataImport {
  const text = typeof source === "string" ? source : decodeLatin1(source);
  const { topLevelDicts, indirect } = readObjects(text);
  const resolve = makeResolver(indirect);

  let fdf: PsDict | undefined;
  for (const dict of topLevelDicts) {
    const candidate = psDict(resolve(dict.FDF));
    if (candidate) {
      fdf = candidate;
      break;
    }
  }
  if (!fdf) {
    throw new Error(
      "Not an FDF file: no /FDF dictionary found. Acrobat writes '<< /FDF << /Fields [...] >> >>'.",
    );
  }

  const fields = psArray(resolve(fdf.Fields));
  if (!fields) {
    throw new Error(
      "FDF file has no /Fields array - there is no form data to import.",
    );
  }

  const values: Record<string, string> = {};
  walkFdfFields(fields, [], values, resolve);

  const href = resolve(fdf.F);
  return {
    format: "fdf",
    values,
    pdfHref: typeof href === "string" ? decodePdfString(href) : undefined,
  };
}

/** True when the text looks like an FDF file. */
export function looksLikeFdf(text: string): boolean {
  return (
    /%FDF-/.test(text.slice(0, 1024)) || /\/FDF\s*<</.test(text.slice(0, 8192))
  );
}

// ---------------------------------------------------------------------------
// Format-sniffing entry point
// ---------------------------------------------------------------------------

/**
 * Read an exported form-data file, detecting XFDF vs FDF from its contents
 * rather than its extension.
 *
 * @throws with a user-readable message when the file is neither.
 */
export async function parseFormDataFile(
  file: File | Blob,
): Promise<FormDataImport> {
  const buffer = await file.arrayBuffer();
  const latin1 = decodeLatin1(buffer);

  if (looksLikeFdf(latin1)) return parseFdf(latin1);
  if (looksLikeXfdf(latin1)) {
    // XFDF is XML and may be UTF-8; re-decode before handing it to DOMParser.
    return parseXfdf(new TextDecoder("utf-8").decode(buffer));
  }
  throw new Error(
    "Unrecognised form data file. Expected XFDF (<xfdf> XML) or FDF (%FDF-).",
  );
}

/**
 * Restrict imported values to fields the open document actually has, so a
 * mismatched export cannot inject junk keys into the form store.
 *
 * Returns the values to apply plus the names that were dropped, which the UI
 * reports rather than silently ignoring.
 */
export function reconcileImportedValues(
  imported: Record<string, string>,
  knownFieldNames: Iterable<string>,
): { applied: Record<string, string>; unmatched: string[] } {
  const known = new Set(knownFieldNames);
  const applied: Record<string, string> = {};
  const unmatched: string[] = [];
  for (const [name, value] of Object.entries(imported)) {
    if (known.has(name)) {
      applied[name] = value;
    } else {
      unmatched.push(name);
    }
  }
  return { applied, unmatched };
}
