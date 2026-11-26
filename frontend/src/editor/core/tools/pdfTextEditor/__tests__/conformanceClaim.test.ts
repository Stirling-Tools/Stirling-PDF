import { Blob as NodeBlob } from "node:buffer";
import { deflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  ConformanceClaimError,
  applyConformanceClaim,
  readConformanceClaim,
} from "@editor/tools/pdfTextEditor/pdfdoc/passes/conformanceClaim";
import { toLatin1 } from "@editor/tools/pdfTextEditor/pdfdoc/bytes";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

// jsdom's Blob cannot stream, so the Flate fixture would not inflate.
beforeAll(() => {
  vi.stubGlobal("Blob", NodeBlob);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const PDFUA = "http://www.aiim.org/pdfua/ns/id/";
const SCHEMA = "http://www.aiim.org/pdfa/ns/schema#";

function pdf(catalogExtra = "", extra: { num: number; body: string }[] = []) {
  return buildClassicPdf(
    [
      { num: 1, body: `<< /Type /Catalog /Pages 2 0 R ${catalogExtra}>>` },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
      {
        num: 3,
        body: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
      },
      ...extra,
    ],
    1,
  );
}

function packet(descriptionsXml: string): string {
  return (
    `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="${RDF}">` +
    descriptionsXml +
    `</rdf:RDF></x:xmpmeta><?xpacket end="w"?>`
  );
}

function pdfWithPacket(xml: string) {
  return pdf("/Metadata 4 0 R ", [
    { num: 4, body: streamBody("/Type /Metadata /Subtype /XML", xml) },
  ]);
}

const DUBLIN_CORE =
  `<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">` +
  `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">Report</rdf:li></rdf:Alt></dc:title>` +
  `</rdf:Description>`;

const PDFA_2B =
  `<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">` +
  `<pdfaid:part>2</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance>` +
  `</rdf:Description>`;

interface Written {
  part: number | null;
  rdf: Element;
  metadataDict: string;
}

async function written(bytes: Uint8Array): Promise<Written> {
  const raw = (await RawPdf.parse(bytes))!;
  const num = raw.dictRef(raw.objectBody(raw.rootNum)!, "Metadata")!;
  const data = (await raw.streamData(num))!;
  const doc = new DOMParser().parseFromString(
    new TextDecoder().decode(data),
    "application/xml",
  );
  return {
    part: (await readConformanceClaim(raw)).part,
    rdf: doc.getElementsByTagNameNS(RDF, "RDF")[0],
    metadataDict: raw.objectBody(num)!,
  };
}

function elements(rdf: Element, ns: string, name: string): Element[] {
  return Array.from(rdf.getElementsByTagNameNS(ns, name));
}

function pdfUaSchemaEntries(rdf: Element): Element[] {
  return elements(rdf, SCHEMA, "namespaceURI").filter(
    (el) => el.textContent === PDFUA,
  );
}

describe("applyConformanceClaim", () => {
  test("adds an uncompressed metadata stream to a file with none", async () => {
    const out = await written(await applyConformanceClaim(pdf(), 1));
    expect(out.part).toBe(1);
    expect(out.metadataDict).toContain("/Subtype /XML");
    expect(out.metadataDict).not.toContain("/Filter");
    const [part] = elements(out.rdf, PDFUA, "part");
    expect(part.prefix).toBe("pdfuaid");
    expect(elements(out.rdf, PDFUA, "rev")).toHaveLength(0);
  });

  test("declares the edition year for PDF/UA-2", async () => {
    const out = await written(await applyConformanceClaim(pdf(), 2));
    expect(out.part).toBe(2);
    expect(elements(out.rdf, PDFUA, "rev")[0].textContent).toBe("2024");
  });

  test("keeps the rest of the packet", async () => {
    const out = await written(
      await applyConformanceClaim(pdfWithPacket(packet(DUBLIN_CORE)), 1),
    );
    expect(out.part).toBe(1);
    expect(out.rdf.textContent).toContain("Report");
  });

  test("reads a compressed packet", async () => {
    const xml = new TextEncoder().encode(packet(DUBLIN_CORE));
    const data = toLatin1(new Uint8Array(deflateSync(xml)));
    const bytes = pdf("/Metadata 4 0 R ", [
      {
        num: 4,
        body: streamBody(
          "/Type /Metadata /Subtype /XML /Filter /FlateDecode",
          data,
        ),
      },
    ]);
    const out = await written(await applyConformanceClaim(bytes, 1));
    expect(out.rdf.textContent).toContain("Report");
    expect(out.metadataDict).not.toContain("/Filter");
  });

  test("replaces an existing claim rather than adding a second", async () => {
    const declared = await applyConformanceClaim(pdf(), 1);
    const out = await written(await applyConformanceClaim(declared, 2));
    expect(out.part).toBe(2);
    expect(elements(out.rdf, PDFUA, "part")).toHaveLength(1);
  });

  test("replaces a claim written as an attribute or under another prefix", async () => {
    const bytes = pdfWithPacket(
      packet(
        `<rdf:Description rdf:about="" xmlns:ua="${PDFUA}" ua:part="1"/>` +
          `<rdf:Description rdf:about="" xmlns:pdfuaid="${PDFUA}" pdfuaid:part="1"/>`,
      ),
    );
    const out = await written(await applyConformanceClaim(bytes, 2));
    expect(out.part).toBe(2);
    const parts = elements(out.rdf, PDFUA, "part");
    expect(parts).toHaveLength(1);
    expect(parts[0].prefix).toBe("pdfuaid");
    expect(
      Array.from(out.rdf.getElementsByTagNameNS(RDF, "Description")).some(
        (el) => el.getAttributeNS(PDFUA, "part") !== null,
      ),
    ).toBe(false);
  });

  test("withdraws the claim and keeps everything else", async () => {
    const declared = await applyConformanceClaim(
      pdfWithPacket(packet(DUBLIN_CORE)),
      1,
    );
    const out = await written(await applyConformanceClaim(declared, null));
    expect(out.part).toBeNull();
    expect(elements(out.rdf, PDFUA, "part")).toHaveLength(0);
    expect(out.rdf.textContent).toContain("Report");
  });

  test("leaves a file with no metadata alone when withdrawing", async () => {
    const bytes = pdf();
    expect(await applyConformanceClaim(bytes, null)).toBe(bytes);
  });

  test("describes pdfuaid in a PDF/A file's extension schemas", async () => {
    const out = await written(
      await applyConformanceClaim(pdfWithPacket(packet(PDFA_2B)), 2),
    );
    expect(out.part).toBe(2);
    expect(out.rdf.textContent).toContain("B");
    const [entry] = pdfUaSchemaEntries(out.rdf);
    const schema = entry.parentElement!;
    expect(
      elements(schema, SCHEMA, "prefix").map((el) => el.textContent),
    ).toEqual(["pdfuaid"]);
    const names = elements(
      schema,
      "http://www.aiim.org/pdfa/ns/property#",
      "name",
    ).map((el) => el.textContent);
    expect(names).toEqual(["part", "rev"]);
  });

  test("adds to a PDF/A file's existing extension schemas once", async () => {
    const otherSchema =
      `<rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="${SCHEMA}">` +
      `<pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource">` +
      `<pdfaSchema:namespaceURI>http://ns.example.com/other/</pdfaSchema:namespaceURI>` +
      `</rdf:li></rdf:Bag></pdfaExtension:schemas></rdf:Description>`;
    const bytes = pdfWithPacket(packet(PDFA_2B + otherSchema));
    const once = await applyConformanceClaim(bytes, 1);
    const out = await written(await applyConformanceClaim(once, 1));
    expect(pdfUaSchemaEntries(out.rdf)).toHaveLength(1);
    expect(out.rdf.textContent).toContain("http://ns.example.com/other/");
  });

  test("withdrawing drops the extension schema entry it added", async () => {
    const declared = await applyConformanceClaim(
      pdfWithPacket(packet(PDFA_2B)),
      1,
    );
    const out = await written(await applyConformanceClaim(declared, null));
    expect(pdfUaSchemaEntries(out.rdf)).toHaveLength(0);
    expect(
      elements(out.rdf, "http://www.aiim.org/pdfa/ns/extension/", "schemas"),
    ).toHaveLength(0);
    expect(out.rdf.textContent).toContain("B");
  });

  test("adds no extension schema outside PDF/A", async () => {
    const out = await written(await applyConformanceClaim(pdf(), 1));
    expect(pdfUaSchemaEntries(out.rdf)).toHaveLength(0);
  });

  test("refuses to overwrite metadata it cannot read", async () => {
    await expect(
      applyConformanceClaim(pdfWithPacket("<x:xmpmeta"), 1),
    ).rejects.toBeInstanceOf(ConformanceClaimError);
  });
});

describe("readConformanceClaim", () => {
  async function read(bytes: Uint8Array) {
    return readConformanceClaim((await RawPdf.parse(bytes))!);
  }

  test("finds no claim in a file without metadata, and can add one", async () => {
    expect(await read(pdf())).toEqual({ part: null, writable: true });
  });

  test("reads a claim written as an attribute", async () => {
    const bytes = pdfWithPacket(
      packet(
        `<rdf:Description rdf:about="" xmlns:pdfuaid="${PDFUA}" pdfuaid:part="2" pdfuaid:rev="2024"/>`,
      ),
    );
    expect(await read(bytes)).toEqual({ part: 2, writable: true });
  });

  test("does not count PDF/UA-2 without its rev as declared", async () => {
    const bytes = pdfWithPacket(
      packet(
        `<rdf:Description rdf:about="" xmlns:pdfuaid="${PDFUA}"><pdfuaid:part>2</pdfuaid:part></rdf:Description>`,
      ),
    );
    expect(await read(bytes)).toEqual({ part: null, writable: true });
  });

  test("reports a file without a cross-reference section as not writable", async () => {
    const full = pdf();
    const bytes = full.slice(0, toLatin1(full).lastIndexOf("startxref"));
    expect(await read(bytes)).toEqual({ part: null, writable: false });
  });

  test("does not count a claim under another prefix as declared", async () => {
    const bytes = pdfWithPacket(
      packet(
        `<rdf:Description rdf:about="" xmlns:ua="${PDFUA}"><ua:part>1</ua:part></rdf:Description>`,
      ),
    );
    expect(await read(bytes)).toEqual({ part: null, writable: true });
  });

  test("reports metadata it cannot parse as not writable", async () => {
    expect(await read(pdfWithPacket("<x:xmpmeta"))).toEqual({
      part: null,
      writable: false,
    });
  });
});
