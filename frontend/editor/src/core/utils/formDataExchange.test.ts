/**
 * Unit tests for XFDF / FDF form-data exchange.
 */

import { describe, test, expect } from "vitest";
import {
  buildXfdf,
  decodeLatin1,
  looksLikeFdf,
  looksLikeXfdf,
  parseFdf,
  parseFormDataFile,
  parseXfdf,
  reconcileImportedValues,
} from "@app/utils/formDataExchange";

const XFDF = `<?xml version="1.0" encoding="UTF-8"?>
<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">
  <f href="application-form.pdf"/>
  <ids original="7A9B" modified="7A9C"/>
  <fields>
    <field name="FullName">
      <value>Ada Lovelace</value>
    </field>
    <field name="Address">
      <field name="Street">
        <value>1 High Street</value>
      </field>
      <field name="City">
        <value>London</value>
      </field>
    </field>
    <field name="AgreeToTerms">
      <value>Yes</value>
    </field>
    <field name="Languages">
      <value>English</value>
      <value>French</value>
    </field>
    <field name="Notes">
      <value>  leading and trailing spaces  </value>
    </field>
  </fields>
</xfdf>
`;

const FDF = `%FDF-1.2
1 0 obj
<<
/FDF
<<
/Fields [
<< /T (FullName) /V (Ada Lovelace) >>
<< /T (Address) /Kids [ << /T (Street) /V (1 High Street) >> << /T (City) /V (London) >> ] >>
<< /T (AgreeToTerms) /V /Yes >>
<< /T (Languages) /V [ (English) (French) ] >>
<< /T (Escaped) /V (a \\(nested\\) value) >>
]
/F (application-form.pdf)
>>
>>
endobj
trailer
<< /Root 1 0 R >>
%%EOF
`;

/**
 * Real Apryse output: no whitespace between elements, line breaks *inside*
 * the tags, and `<f>` before `<fields>`.
 */
const APRYSE_XFDF = `<?xml version="1.0" encoding="UTF-8"?>
<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve"
><f href="form1.pdf"
/><fields
><field name="c1-1"
><value
>Yes</value
></field
><field name="c1-3"
><value
>Off</value
></field
><field name="f1-1"
><value
>John Smith</value
></field
></fields
><ids original="67B7546B7635ED89E01C7BB03AA168C7" modified="4284ECDB48B3FF4398965B6C2FF19638"
/></xfdf
>`;

/** Real output with /V before /T and a blank line before the header. */
const SF52_FDF = `
%FDF-1.2
1 0 obj
<<
/FDF << /Fields [
  << /V (Sample EdLevel)/T (EdLevel) >>
<< /V (Sample DegAttan)/T (DegAttan) >>

] >>
>>
endobj
trailer
<<
/Root 1 0 R
>>
%%EOF
`;

/** Real DevExpress output: hex strings with UTF-16BE values throughout. */
const HEX_FDF = `%FDF-1.2
1 0 obj
<</FDF <</Fields [<</T <67656E6572617465417070656172616E636573> /V <FEFF> >>
 <</T <4C6173744E616D65> /V <FEFF0053006D006900740068> >>
 <</T <46697273744E616D65> /V <FEFF004A006F0068006E0020> >>
] >>
 /Version /1#2E2 >>
endobj
trailer
<</Root 1 0 R >>
%%EOF
`;

/**
 * Real Syncfusion output: each field is its own indirect object and /Fields
 * is an array of references, reached through a second reference (/FDF 8 0 R).
 */
const INDIRECT_FDF = `%FDF-1.2
1 0 obj<</T <46697273744E616D65> /V <41424344> >>endobj
2 0 obj<</T <4C6173744E616D65> /V <58595A> >>endobj
3 0 obj<</T <436F6D70616E79206E616D65> /V <53796E63667573696F6E> >>endobj
8 0 obj<</F <4163726F466F726D31>  /Fields [1 0 R 2 0 R 3 0 R ]>>endobj
9 0 obj<</Version /1.4 /FDF 8 0 R>>endobj
trailer
<</Root 9 0 R>>
`;

/**
 * jsdom has no real `Blob.arrayBuffer()`, and setupTests stubs it with eight
 * dummy bytes — so a plain `new File([...])` cannot be read back. Attach a
 * working implementation for the files under test.
 */
function fileWithBytes(content: string | Uint8Array, name: string): File {
  const bytes =
    typeof content === "string" ? new TextEncoder().encode(content) : content;
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const file = new File([buffer], name);
  Object.defineProperty(file, "arrayBuffer", { value: async () => buffer });
  return file;
}

/** Build an FDF byte array whose value is a UTF-16BE string, as Acrobat writes. */
function fdfWithUtf16Value(fieldName: string, value: string): Uint8Array {
  const bytes: number[] = [];
  const push = (text: string) => {
    for (const ch of text) bytes.push(ch.charCodeAt(0));
  };
  push(`%FDF-1.2\n1 0 obj\n<< /FDF << /Fields [ << /T (${fieldName}) /V (`);
  bytes.push(0xfe, 0xff); // UTF-16BE byte-order mark
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    bytes.push((code >> 8) & 0xff, code & 0xff);
  }
  push(") >> ] >> >>\nendobj\n%%EOF\n");
  return new Uint8Array(bytes);
}

describe("formDataExchange", () => {
  describe("parseXfdf", () => {
    test("reads flat and hierarchical field values", () => {
      const { values, pdfHref, format } = parseXfdf(XFDF);
      expect(format).toBe("xfdf");
      expect(pdfHref).toBe("application-form.pdf");
      expect(values.FullName).toBe("Ada Lovelace");
      expect(values["Address.Street"]).toBe("1 High Street");
      expect(values["Address.City"]).toBe("London");
      expect(values.AgreeToTerms).toBe("Yes");
    });

    test("joins multiple values for multi-select fields", () => {
      expect(parseXfdf(XFDF).values.Languages).toBe("English,French");
    });

    test("preserves whitespace, since xml:space is preserve", () => {
      expect(parseXfdf(XFDF).values.Notes).toBe(
        "  leading and trailing spaces  ",
      );
    });

    test("a branch field with no value of its own is not emitted", () => {
      expect(parseXfdf(XFDF).values).not.toHaveProperty("Address");
    });

    test("rejects malformed XML", () => {
      expect(() => parseXfdf("<xfdf><fields></xfdf>")).toThrow(/not valid XML/);
    });

    test("rejects XML that is not XFDF", () => {
      expect(() => parseXfdf('<?xml version="1.0"?><foo/>')).toThrow(
        /expected an <xfdf> root/,
      );
    });
  });

  describe("parseFdf", () => {
    test("reads values, Kids hierarchy and name values", () => {
      const { values, pdfHref, format } = parseFdf(FDF);
      expect(format).toBe("fdf");
      expect(pdfHref).toBe("application-form.pdf");
      expect(values.FullName).toBe("Ada Lovelace");
      expect(values["Address.Street"]).toBe("1 High Street");
      expect(values["Address.City"]).toBe("London");
      // A checkbox export value is stored as a PDF name, not a string.
      expect(values.AgreeToTerms).toBe("Yes");
    });

    test("joins array values for multi-select fields", () => {
      expect(parseFdf(FDF).values.Languages).toBe("English,French");
    });

    test("decodes escaped parentheses", () => {
      expect(parseFdf(FDF).values.Escaped).toBe("a (nested) value");
    });

    test("decodes UTF-16BE strings", () => {
      const bytes = fdfWithUtf16Value("Name", "Ada Ada € ünïcode");
      expect(parseFdf(bytes).values.Name).toBe("Ada Ada € ünïcode");
    });

    test("rejects a file with no /FDF dictionary", () => {
      expect(() => parseFdf("%PDF-1.7\n<< /Type /Catalog >>\n")).toThrow(
        /no \/FDF dictionary/,
      );
    });

    test("rejects an FDF with no /Fields array", () => {
      expect(() => parseFdf("%FDF-1.2\n<< /FDF << /F (x.pdf) >> >>\n")).toThrow(
        /no \/Fields array/,
      );
    });
  });

  describe("real-world exports", () => {
    test("Apryse XFDF with line breaks inside tags", () => {
      const { values, pdfHref } = parseXfdf(APRYSE_XFDF);
      expect(pdfHref).toBe("form1.pdf");
      expect(values).toEqual({
        "c1-1": "Yes",
        "c1-3": "Off",
        "f1-1": "John Smith",
      });
    });

    test("FDF with /V before /T and a leading blank line", () => {
      expect(parseFdf(SF52_FDF).values).toEqual({
        EdLevel: "Sample EdLevel",
        DegAttan: "Sample DegAttan",
      });
    });

    test("FDF using hex strings and UTF-16BE values", () => {
      expect(parseFdf(HEX_FDF).values).toEqual({
        generateAppearances: "",
        LastName: "Smith",
        FirstName: "John ",
      });
    });

    test("FDF whose fields are indirect objects behind a /FDF reference", () => {
      const { values, pdfHref } = parseFdf(INDIRECT_FDF);
      expect(pdfHref).toBe("AcroForm1");
      expect(values).toEqual({
        FirstName: "ABCD",
        LastName: "XYZ",
        "Company name": "Syncfusion",
      });
    });

    test("a reference cycle terminates with an error instead of hanging", () => {
      const cyclic = `%FDF-1.2
1 0 obj<</FDF 2 0 R>>endobj
2 0 obj 1 0 R endobj
trailer<</Root 1 0 R>>
`;
      // Which error it lands on doesn't matter; not hanging does.
      expect(() => parseFdf(cyclic)).toThrow(/no form data|no \/FDF/);
    });
  });

  describe("format detection", () => {
    test("recognises each format and rejects the other", () => {
      expect(looksLikeXfdf(XFDF)).toBe(true);
      expect(looksLikeFdf(XFDF)).toBe(false);
      expect(looksLikeFdf(FDF)).toBe(true);
      expect(looksLikeXfdf(FDF)).toBe(false);
    });
  });

  describe("buildXfdf", () => {
    test("round-trips flat, hierarchical and multi-select values", () => {
      const values = {
        FullName: "Ada Lovelace",
        "Address.Street": "1 High Street",
        Languages: "English,French",
      };
      const xml = buildXfdf(values, {
        pdfHref: "application-form.pdf",
        multiSelectFields: ["Languages"],
      });

      const reparsed = parseXfdf(xml);
      expect(reparsed.values).toEqual(values);
      expect(reparsed.pdfHref).toBe("application-form.pdf");
      // The hierarchy is rebuilt as nested elements, not a literal dotted name.
      expect(xml).toContain('<field name="Address">');
      expect(xml).toContain('<field name="Street">');
    });

    test("commas in a single-value field are not split into two values", () => {
      const xml = buildXfdf({ Address: "1 High Street, London" });
      expect(parseXfdf(xml).values.Address).toBe("1 High Street, London");
      expect(xml.match(/<value>/g)).toHaveLength(1);
    });

    test("escapes XML metacharacters in names and values", () => {
      const xml = buildXfdf({ "a&b": '<script> "quoted"' });
      expect(xml).toContain('name="a&amp;b"');
      expect(xml).toContain("&lt;script&gt; &quot;quoted&quot;");
      expect(parseXfdf(xml).values["a&b"]).toBe('<script> "quoted"');
    });

    test("omits the <f> element when no href is given", () => {
      expect(buildXfdf({ A: "1" })).not.toContain("<f ");
    });

    test("an empty form still produces valid XFDF", () => {
      expect(parseXfdf(buildXfdf({})).values).toEqual({});
    });
  });

  describe("parseFormDataFile", () => {
    test("detects XFDF from content, not the extension", async () => {
      const file = fileWithBytes(XFDF, "data.txt");
      expect((await parseFormDataFile(file)).format).toBe("xfdf");
    });

    test("detects FDF from content, not the extension", async () => {
      const file = fileWithBytes(FDF, "data.txt");
      expect((await parseFormDataFile(file)).format).toBe("fdf");
    });

    test("reads UTF-8 XFDF correctly", async () => {
      const xml = buildXfdf({ Name: "Ünïcode € dash" });
      const file = fileWithBytes(xml, "data.xfdf");
      expect((await parseFormDataFile(file)).values.Name).toBe(
        "Ünïcode € dash",
      );
    });

    test("reads binary FDF with UTF-16 values", async () => {
      const file = fileWithBytes(
        fdfWithUtf16Value("Name", "Ünïcode € dash"),
        "data.fdf",
      );
      expect((await parseFormDataFile(file)).values.Name).toBe(
        "Ünïcode € dash",
      );
    });

    test("rejects anything else", async () => {
      const file = fileWithBytes('{"a":1}', "data.json");
      await expect(parseFormDataFile(file)).rejects.toThrow(
        /Unrecognised form data file/,
      );
    });
  });

  describe("decodeLatin1", () => {
    test("maps every byte to one character", () => {
      const bytes = new Uint8Array([0x00, 0x41, 0xfe, 0xff]);
      const text = decodeLatin1(bytes);
      expect(text).toHaveLength(4);
      expect(text.charCodeAt(2)).toBe(0xfe);
    });
  });

  describe("reconcileImportedValues", () => {
    test("splits values into applied and unmatched", () => {
      const { applied, unmatched } = reconcileImportedValues(
        { A: "1", B: "2", C: "3" },
        ["A", "C"],
      );
      expect(applied).toEqual({ A: "1", C: "3" });
      expect(unmatched).toEqual(["B"]);
    });

    test("an empty document matches nothing", () => {
      const { applied, unmatched } = reconcileImportedValues({ A: "1" }, []);
      expect(applied).toEqual({});
      expect(unmatched).toEqual(["A"]);
    });
  });
});
