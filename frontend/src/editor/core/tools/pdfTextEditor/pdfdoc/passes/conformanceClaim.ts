/**
 * Read and write the PDF/UA identification schema in the catalog's XMP
 * metadata (ISO 14289-1 and ISO 14289-2, clause 5): `pdfuaid:part`, plus
 * `pdfuaid:rev` for PDF/UA-2.
 */
import {
  RawPdf,
  indirectRef,
  setDictEntry,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  appendRevision,
  plainObject,
  streamObject,
  unusedObjectNumber,
  type RevisionObject,
} from "@editor/tools/pdfTextEditor/pdfdoc/revision";

export type PdfUaPart = 1 | 2;

const PDFUA_NS = "http://www.aiim.org/pdfua/ns/id/";
const PDFA_ID_NS = "http://www.aiim.org/pdfa/ns/id/";
const RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";
const EXTENSION_NS = "http://www.aiim.org/pdfa/ns/extension/";
const SCHEMA_NS = "http://www.aiim.org/pdfa/ns/schema#";
const PROPERTY_NS = "http://www.aiim.org/pdfa/ns/property#";

/** The ISO 14289-2 edition year a PDF/UA-2 file declares as `pdfuaid:rev`. */
const PDF_UA_2_REVISION = "2024";

/** Thrown when the claim cannot be written. */
export class ConformanceClaimError extends Error {
  constructor(reason: string) {
    super(`Could not write the PDF/UA conformance claim: ${reason}`);
    this.name = "ConformanceClaimError";
  }
}

/** The part the file's XMP declares; null when it declares none or the packet cannot be read. */
export async function readConformanceClaim(
  pdf: RawPdf,
): Promise<number | null> {
  const catalog = pdf.objectBody(pdf.rootNum);
  const num = catalog ? pdf.dictRef(catalog, "Metadata") : null;
  if (num === null) return null;
  const data = await pdf.streamData(num);
  const rdf = data ? parsePacket(decodeXml(data)) : null;
  return rdf ? declaredPart(rdf) : null;
}

/**
 * `bytes` declaring PDF/UA `part`, or declaring nothing when `part` is null,
 * as an appended revision. The rest of the packet is kept. When the packet
 * also declares PDF/A, the pdfuaid namespace is described in its extension
 * schemas, which PDF/A requires of any property its own schemas do not
 * define. Throws ConformanceClaimError when the file is encrypted, or its
 * catalog or existing metadata cannot be read: rewriting a packet this cannot
 * read would drop what it holds.
 */
export async function applyConformanceClaim(
  bytes: Uint8Array,
  part: PdfUaPart | null,
): Promise<Uint8Array> {
  const pdf = await RawPdf.parse(bytes);
  if (!pdf) throw new ConformanceClaimError("the file could not be read");
  if (pdf.encrypted) throw new ConformanceClaimError("the file is encrypted");
  const catalog = pdf.objectBody(pdf.rootNum);
  if (!catalog)
    throw new ConformanceClaimError("the file's catalog cannot be read");

  const existingNum = pdf.dictRef(catalog, "Metadata");
  let rdf: Element;
  if (existingNum === null) {
    if (part === null) return bytes;
    rdf = emptyPacket();
  } else {
    const data = await pdf.streamData(existingNum);
    const parsed = data ? parsePacket(decodeXml(data)) : null;
    if (!parsed)
      throw new ConformanceClaimError("the file's metadata cannot be read");
    rdf = parsed;
  }

  writeClaim(rdf, part);

  const num = existingNum ?? unusedObjectNumber(pdf, new Map());
  // PDF/A forbids a filter on the metadata stream.
  const objects: RevisionObject[] = [
    {
      num,
      body: streamObject(
        "<< /Type /Metadata /Subtype /XML >>",
        new TextEncoder().encode(serializePacket(rdf)),
      ),
    },
  ];
  if (existingNum === null) {
    const updated = setDictEntry(catalog, "Metadata", indirectRef(pdf, num));
    if (!updated)
      throw new ConformanceClaimError("the catalog is not a dictionary");
    objects.push({ num: pdf.rootNum, body: plainObject(updated) });
  }
  const out = appendRevision(pdf, objects);
  if (!out) throw new ConformanceClaimError("the file cannot be extended");
  return out;
}

function decodeXml(data: Uint8Array): string {
  if (data[0] === 0xfe && data[1] === 0xff)
    return new TextDecoder("utf-16be").decode(data);
  if (data[0] === 0xff && data[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(data);
  return new TextDecoder("utf-8").decode(data);
}

/** The packet's rdf:RDF, or null when it is not XML with one. */
function parsePacket(xml: string): Element | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return null;
  return doc.getElementsByTagNameNS(RDF_NS, "RDF")[0] ?? null;
}

function emptyPacket(): Element {
  const doc = new DOMParser().parseFromString(
    `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="${RDF_NS}"/></x:xmpmeta>`,
    "application/xml",
  );
  return doc.getElementsByTagNameNS(RDF_NS, "RDF")[0];
}

/**
 * The packet re-wrapped in a fresh xpacket header and trailer. The parser
 * keeps neither the original's padding nor anything outside its root.
 */
function serializePacket(rdf: Element): string {
  const root = rdf.ownerDocument.documentElement;
  const body = new XMLSerializer().serializeToString(root);
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n${body}\n<?xpacket end="w"?>`;
}

function descriptions(rdf: Element): Element[] {
  return Array.from(rdf.children).filter(
    (el) => el.namespaceURI === RDF_NS && el.localName === "Description",
  );
}

/** A property written either as an attribute of a description or as its child. */
function propertyValue(
  description: Element,
  ns: string,
  name: string,
): string | null {
  const attribute = description.getAttributeNS(ns, name);
  if (attribute !== null) return attribute;
  const child = Array.from(description.children).find(
    (el) => el.namespaceURI === ns && el.localName === name,
  );
  return child?.textContent ?? null;
}

function declaredPart(rdf: Element): number | null {
  for (const description of descriptions(rdf)) {
    const value = propertyValue(description, PDFUA_NS, "part");
    if (value === null) continue;
    const part = parseInt(value.trim(), 10);
    return Number.isNaN(part) ? null : part;
  }
  return null;
}

function declaresPdfA(rdf: Element): boolean {
  return descriptions(rdf).some(
    (description) => propertyValue(description, PDFA_ID_NS, "part") !== null,
  );
}

function writeClaim(rdf: Element, part: PdfUaPart | null): void {
  for (const description of descriptions(rdf)) removeClaim(description);
  removeExtensionEntries(rdf);
  if (part !== null) {
    const description = newDescription(rdf);
    description.setAttributeNS(XMLNS_NS, "xmlns:pdfuaid", PDFUA_NS);
    description.append(textElement(rdf, PDFUA_NS, "pdfuaid:part", `${part}`));
    if (part === 2)
      description.append(
        textElement(rdf, PDFUA_NS, "pdfuaid:rev", PDF_UA_2_REVISION),
      );
    if (declaresPdfA(rdf)) addExtensionEntry(rdf, part);
  }
  for (const description of descriptions(rdf)) {
    if (isEmpty(description)) description.remove();
  }
}

/** Drops pdfuaid properties under any prefix, since a claim with the wrong prefix fails clause 5 too. */
function removeClaim(description: Element): void {
  for (const attribute of Array.from(description.attributes)) {
    if (
      attribute.namespaceURI === PDFUA_NS ||
      (attribute.namespaceURI === XMLNS_NS && attribute.value === PDFUA_NS)
    )
      description.removeAttributeNode(attribute);
  }
  for (const child of Array.from(description.children)) {
    if (child.namespaceURI === PDFUA_NS) child.remove();
  }
}

/** Every description in one packet must share its rdf:about (ISO 16684-1 7.4). */
function newDescription(rdf: Element): Element {
  const about = descriptions(rdf)[0]?.getAttributeNS(RDF_NS, "about") ?? "";
  const description = rdf.ownerDocument.createElementNS(
    RDF_NS,
    "rdf:Description",
  );
  description.setAttributeNS(RDF_NS, "rdf:about", about);
  rdf.append(description);
  return description;
}

function isEmpty(description: Element): boolean {
  if (description.children.length > 0) return false;
  return Array.from(description.attributes).every(
    (attribute) =>
      attribute.namespaceURI === XMLNS_NS ||
      (attribute.namespaceURI === RDF_NS && attribute.localName === "about"),
  );
}

function textElement(
  rdf: Element,
  ns: string,
  qualifiedName: string,
  text: string,
): Element {
  const el = rdf.ownerDocument.createElementNS(ns, qualifiedName);
  el.textContent = text;
  return el;
}

function rdfChild(rdf: Element, localName: string): Element {
  return rdf.ownerDocument.createElementNS(RDF_NS, `rdf:${localName}`);
}

/** The extension schema bags (`pdfaExtension:schemas`) the packet holds. */
function extensionBags(rdf: Element): Element[] {
  return Array.from(rdf.getElementsByTagNameNS(EXTENSION_NS, "schemas"))
    .map((schemas) =>
      Array.from(schemas.children).find(
        (el) => el.namespaceURI === RDF_NS && el.localName === "Bag",
      ),
    )
    .filter((bag): bag is Element => !!bag);
}

/** Drops the bag entries describing the pdfuaid namespace, and any schemas property left empty. */
function removeExtensionEntries(rdf: Element): void {
  for (const bag of extensionBags(rdf)) {
    for (const entry of Array.from(bag.children)) {
      if (describesPdfUa(entry)) entry.remove();
    }
    if (bag.children.length === 0) bag.parentElement?.remove();
  }
}

function describesPdfUa(entry: Element): boolean {
  if (entry.getAttributeNS(SCHEMA_NS, "namespaceURI") === PDFUA_NS) return true;
  return Array.from(
    entry.getElementsByTagNameNS(SCHEMA_NS, "namespaceURI"),
  ).some((el) => el.textContent?.trim() === PDFUA_NS);
}

/** Describes the pdfuaid namespace as PDF/A-1 6.7.8 and PDF/A-2 6.6.2.3 require. */
function addExtensionEntry(rdf: Element, part: PdfUaPart): void {
  let bag = extensionBags(rdf)[0];
  if (!bag) {
    const description = newDescription(rdf);
    const schemas = rdf.ownerDocument.createElementNS(
      EXTENSION_NS,
      "pdfaExtension:schemas",
    );
    bag = rdfChild(rdf, "Bag");
    schemas.append(bag);
    description.append(schemas);
  }

  const properties = rdfChild(rdf, "Seq");
  properties.append(
    propertyEntry(
      rdf,
      "part",
      "Indicates which part of ISO 14289 the document conforms to",
    ),
  );
  if (part === 2)
    properties.append(
      propertyEntry(
        rdf,
        "rev",
        "Indicates the year of the ISO 14289 edition the document conforms to",
      ),
    );
  const property = rdf.ownerDocument.createElementNS(
    SCHEMA_NS,
    "pdfaSchema:property",
  );
  property.append(properties);

  const entry = resourceEntry(rdf);
  entry.append(
    textElement(
      rdf,
      SCHEMA_NS,
      "pdfaSchema:schema",
      "PDF/UA Universal Accessibility Schema",
    ),
    textElement(rdf, SCHEMA_NS, "pdfaSchema:namespaceURI", PDFUA_NS),
    textElement(rdf, SCHEMA_NS, "pdfaSchema:prefix", "pdfuaid"),
    property,
  );
  bag.append(entry);
}

function propertyEntry(
  rdf: Element,
  name: string,
  description: string,
): Element {
  const entry = resourceEntry(rdf);
  entry.append(
    textElement(rdf, PROPERTY_NS, "pdfaProperty:name", name),
    textElement(rdf, PROPERTY_NS, "pdfaProperty:valueType", "Integer"),
    textElement(rdf, PROPERTY_NS, "pdfaProperty:category", "internal"),
    textElement(rdf, PROPERTY_NS, "pdfaProperty:description", description),
  );
  return entry;
}

function resourceEntry(rdf: Element): Element {
  const entry = rdfChild(rdf, "li");
  entry.setAttributeNS(RDF_NS, "rdf:parseType", "Resource");
  return entry;
}
