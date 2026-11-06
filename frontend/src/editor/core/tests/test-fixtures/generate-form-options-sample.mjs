// One-off script: generate `form-options-sample.pdf` — a dropdown with
// [export, display] /Opt pairs and push buttons covering every action shape
// the form provider reads (/A with URI, JavaScript, Named, SubmitForm; and
// /AA /U). The fields are raw context objects so the fixture stays independent
// of any form-authoring API.
//
// Run with: node generate-form-options-sample.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, PDFName, PDFString } from "@cantoo/pdf-lib";

const here = dirname(fileURLToPath(import.meta.url));

const doc = await PDFDocument.create();
const page = doc.addPage([612, 792]);
const pageRef = page.ref;

const widget = (row) =>
  doc.context.register(
    doc.context.obj({
      Type: "Annot",
      Subtype: "Widget",
      Rect: [48, 700 - row * 40, 240, 720 - row * 40],
      P: pageRef,
      F: 4,
    }),
  );

const w1 = widget(1);
const w2 = widget(2);
const w3 = widget(3);
const w4 = widget(4);
const w5 = widget(5);
const w6 = widget(6);

const choice = doc.context.register(
  doc.context.obj({
    FT: "Ch",
    T: PDFString.of("choice_1"),
    Opt: [
      PDFString.of("one-value"),
      [PDFString.of("two-value"), PDFString.of("Two Label")],
      PDFString.of("plain"),
    ],
    Kids: [w1],
  }),
);

const pushUri = doc.context.register(
  doc.context.obj({
    FT: "Btn",
    Ff: 65536,
    T: PDFString.of("push_uri"),
    MK: { CA: PDFString.of("Ship it") },
    A: { S: "URI", URI: PDFString.of("https://example.com/go") },
    Kids: [w2],
  }),
);

const pushJs = doc.context.register(
  doc.context.obj({
    FT: "Btn",
    Ff: 65536,
    T: PDFString.of("push_js"),
    A: { S: "JavaScript", JS: PDFString.of("app.alert('hi')") },
    Kids: [w3],
  }),
);

const pushNamed = doc.context.register(
  doc.context.obj({
    FT: "Btn",
    Ff: 65536,
    T: PDFString.of("push_named"),
    A: { S: "Named", N: "Print" },
    Kids: [w4],
  }),
);

const pushAdditional = doc.context.register(
  doc.context.obj({
    FT: "Btn",
    Ff: 65536,
    T: PDFString.of("push_additional"),
    AA: { U: { S: "URI", URI: PDFString.of("https://example.com/up") } },
    Kids: [w5],
  }),
);

const pushSubmit = doc.context.register(
  doc.context.obj({
    FT: "Btn",
    Ff: 65536,
    T: PDFString.of("push_submit"),
    A: {
      S: "SubmitForm",
      F: { F: PDFString.of("https://example.com/post"), FS: "URL" },
      Flags: 4,
    },
    Kids: [w6],
  }),
);

doc.catalog.set(
  PDFName.of("AcroForm"),
  doc.context.register(
    doc.context.obj({
      Fields: [choice, pushUri, pushJs, pushNamed, pushAdditional, pushSubmit],
      DA: PDFString.of("/Helv 0 Tf 0 g"),
    }),
  ),
);
page.node.set(PDFName.of("Annots"), doc.context.obj([w1, w2, w3, w4, w5, w6]));

const bytes = await doc.save();
const out = join(here, "form-options-sample.pdf");
writeFileSync(out, bytes);
console.log(`${out}: ${(bytes.length / 1024).toFixed(1)} KB`);
