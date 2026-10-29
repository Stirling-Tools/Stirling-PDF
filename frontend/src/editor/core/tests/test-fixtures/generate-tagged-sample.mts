import process from "node:process";
// One-off script: generate `tagged-sample.pdf`, a two-page quarterly report
// tagged the way a word processor's accessible export tags one.
//
// Page 1 is what the structure-editing tests assert on, so keep it as is: a
// heading (MCID 0), a two-line paragraph in ONE marked-content sequence
// (MCID 1), a described figure (MCID 2), and a page number artifact.
//
// Page 2 has text in each tag the text editor shows: H2, H3 and a deliberately
// skipped H5, paragraphs holding an inline Link, Quote and Span, a list with
// Lbl and LBody, a Code block, a Note, a custom role the RoleMap leaves
// unmapped, a header artifact, and one line of untagged text.
//
// Run with: npx tsx generate-tagged-sample.mts
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  PDFDocument,
  PDFName,
  PDFNumber,
  type PDFFont,
  type PDFObject,
  type PDFPage,
  PDFRawStream,
  type PDFRef,
  PDFString,
  StandardFonts,
  type PDFContext,
} from "@cantoo/pdf-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CHART_WIDTH = 120;
const CHART_HEIGHT = 80;
/** Revenue for four regions, as bar heights in pixels. */
const BAR_HEIGHTS = [42, 30, 56, 22];

/**
 * RGB samples of a bar chart, top row first: four bars on a pair of axes over
 * light gridlines, so the figure's description describes what it shows.
 */
function barChartPixels(): Uint8Array {
  const pixels = new Uint8Array(CHART_WIDTH * CHART_HEIGHT * 3).fill(255);
  const paint = (x: number, y: number, rgb: [number, number, number]) => {
    pixels.set(rgb, (y * CHART_WIDTH + x) * 3);
  };
  const baseline = CHART_HEIGHT - 8;
  for (let y = baseline - 15; y > 6; y -= 15) {
    for (let x = 9; x < CHART_WIDTH - 6; x++) paint(x, y, [225, 225, 225]);
  }
  BAR_HEIGHTS.forEach((height, i) => {
    const left = 16 + i * 26;
    for (let y = baseline - height; y < baseline; y++) {
      for (let x = left; x < left + 18; x++) paint(x, y, [59, 130, 246]);
    }
  });
  for (let x = 8; x < CHART_WIDTH - 6; x++) paint(x, baseline, [90, 90, 90]);
  for (let y = 6; y <= baseline; y++) paint(8, y, [90, 90, 90]);
  return pixels;
}

interface Font {
  /** The page's resource name for it. */
  name: string;
  pdf: PDFFont;
}

function show(font: Font, size: number, x: number, y: number, text: string) {
  const encoded = font.pdf.encodeText(text).toString();
  return `BT /${font.name} ${size} Tf ${x.toFixed(2)} ${y} Td ${encoded} Tj ET`;
}

/** One kid of a structure element: an MCID on its page, or a child element. */
type Kid = number | PDFRef;

interface PendingElement {
  ref: PDFRef;
  type: string;
  parent: PDFRef;
  page: PDFRef | null;
  kids: Kid[];
  extra: Record<string, PDFObject>;
  attached: boolean;
}

/**
 * Builds the structure tree alongside each page's content, so an element's
 * /K, the content's MCIDs and the ParentTree cannot disagree.
 */
class StructureBuilder {
  readonly rootRef: PDFRef;
  private readonly elements: PendingElement[] = [];
  private readonly byRef = new Map<PDFRef, PendingElement>();
  /** Per page, in StructParents order: the element owning each MCID. */
  private readonly owners: PDFRef[][] = [];

  constructor(private readonly ctx: PDFContext) {
    this.rootRef = ctx.nextRef();
  }

  element(
    type: string,
    parent: PDFRef,
    page: PDFPage | null,
    extra: Record<string, PDFObject> = {},
  ): PDFRef {
    const ref = this.ctx.nextRef();
    const pending = {
      ref,
      type,
      parent,
      page: page?.ref ?? null,
      kids: [],
      extra,
      attached: false,
    };
    this.elements.push(pending);
    this.byRef.set(ref, pending);
    return ref;
  }

  /**
   * Joins the element to its parent's /K when its first content is drawn, not
   * when it is created, so a Link made before its paragraph's first words
   * still reads after them.
   */
  private attach(el: PendingElement): void {
    if (el.attached) return;
    el.attached = true;
    const parent = this.byRef.get(el.parent);
    if (!parent) return;
    this.attach(parent);
    parent.kids.push(el.ref);
  }

  /** Start a page's content; its StructParents key is its index here. */
  page(page: PDFPage): TaggedContent {
    const owners: PDFRef[] = [];
    page.node.set(
      PDFName.of("StructParents"),
      PDFNumber.of(this.owners.length),
    );
    this.owners.push(owners);
    return new TaggedContent(owners, (owner, mcid) => {
      const el = this.byRef.get(owner)!;
      this.attach(el);
      el.kids.push(mcid);
    });
  }

  finish(topLevel: PDFRef): void {
    const ctx = this.ctx;
    for (const el of this.elements) {
      ctx.assign(
        el.ref,
        ctx.obj({
          Type: "StructElem",
          S: el.type,
          P: el.parent,
          ...(el.page ? { Pg: el.page } : {}),
          K: el.kids.length === 1 ? el.kids[0] : el.kids,
          ...el.extra,
        }),
      );
    }
    const nums: PDFObject[] = [];
    this.owners.forEach((owners, key) => {
      nums.push(PDFNumber.of(key), ctx.obj(owners));
    });
    ctx.assign(
      this.rootRef,
      ctx.obj({
        Type: "StructTreeRoot",
        K: topLevel,
        ParentTree: ctx.register(ctx.obj({ Nums: nums })),
        ParentTreeNextKey: this.owners.length,
      }),
    );
  }
}

/** One page's content stream, marking each tagged piece with the next MCID. */
class TaggedContent {
  private readonly ops: string[] = [];

  constructor(
    private readonly owners: PDFRef[],
    private readonly own: (owner: PDFRef, mcid: number) => void,
  ) {}

  /** `ops` as one marked-content sequence of `owner`, tagged `tag`. */
  mark(tag: string, owner: PDFRef, ops: string[]): void {
    const mcid = this.owners.length;
    this.owners.push(owner);
    this.own(owner, mcid);
    this.ops.push(`/${tag} <</MCID ${mcid}>> BDC`, ...ops, "EMC");
  }

  /**
   * One line of pieces set side by side from `x`, each its own sequence: how
   * an inline element sits inside its paragraph's line.
   */
  line(
    x: number,
    y: number,
    size: number,
    pieces: { tag: string; owner: PDFRef; font: Font; text: string }[],
  ): void {
    let at = x;
    for (const piece of pieces) {
      this.mark(piece.tag, piece.owner, [
        show(piece.font, size, at, y, piece.text),
      ]);
      at += piece.font.pdf.widthOfTextAtSize(piece.text, size);
    }
  }

  artifact(properties: string, ops: string[]): void {
    this.ops.push(`/Artifact <<${properties}>> BDC`, ...ops, "EMC");
  }

  untagged(ops: string[]): void {
    this.ops.push(...ops);
  }

  writeTo(ctx: PDFContext, page: PDFPage): void {
    const bytes = new TextEncoder().encode([...this.ops, ""].join("\n"));
    page.node.set(
      PDFName.of("Contents"),
      ctx.register(PDFRawStream.of(ctx.obj({ Length: bytes.length }), bytes)),
    );
  }
}

async function main() {
  const doc = await PDFDocument.create();
  const ctx = doc.context;
  const regular: Font = {
    name: "F1",
    pdf: await doc.embedFont(StandardFonts.Helvetica),
  };
  const bold: Font = {
    name: "F2",
    pdf: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const mono: Font = {
    name: "F3",
    pdf: await doc.embedFont(StandardFonts.Courier),
  };
  const italic: Font = {
    name: "F4",
    pdf: await doc.embedFont(StandardFonts.HelveticaOblique),
  };

  const tree = new StructureBuilder(ctx);
  const document = tree.element("Document", tree.rootRef, null);

  const first = doc.addPage([612, 792]);
  first.node.setFontDictionary(PDFName.of("F1"), regular.pdf.ref);
  first.node.setFontDictionary(PDFName.of("F2"), bold.pdf.ref);
  // Drawn at one pixel per point, matching the 120x80 box the content places it in.
  const image = ctx.register(
    ctx.flateStream(barChartPixels(), {
      Type: "XObject",
      Subtype: "Image",
      Width: CHART_WIDTH,
      Height: CHART_HEIGHT,
      ColorSpace: "DeviceRGB",
      BitsPerComponent: 8,
    }),
  );
  first.node.setXObject(PDFName.of("Im1"), image);

  const one = tree.page(first);
  one.mark("H1", tree.element("H1", document, first), [
    "BT /F2 28 Tf 72 700 Td (Quarterly report) Tj ET",
  ]);
  one.mark("P", tree.element("P", document, first), [
    "BT /F1 14 Tf 72 660 Td (Revenue grew in every region this quarter,) Tj ET",
    "BT /F1 14 Tf 72 642 Td (led by demand for the new product line.) Tj ET",
  ]);
  one.mark(
    "Figure",
    tree.element("Figure", document, first, {
      Alt: PDFString.of("Bar chart of revenue by region"),
    }),
    ["q 120 0 0 80 72 520 cm /Im1 Do Q"],
  );
  one.artifact("/Type /Pagination", ["BT /F1 10 Tf 300 40 Td (Page 1) Tj ET"]);
  one.writeTo(ctx, first);

  const second = doc.addPage([612, 792]);
  for (const font of [regular, bold, mono, italic]) {
    second.node.setFontDictionary(PDFName.of(font.name), font.pdf.ref);
  }
  const two = tree.page(second);
  const el = (type: string, extra?: Record<string, PDFObject>) =>
    tree.element(type, document, second, extra);
  const block = (
    tag: string,
    font: Font,
    size: number,
    y: number,
    text: string,
  ) => two.mark(tag, el(tag), [show(font, size, 72, y, text)]);

  two.artifact("/Type /Pagination /Subtype /Header", [
    show(regular, 9, 72, 750, "Acme Corp  |  Q3 2026 quarterly report"),
  ]);

  block("H2", bold, 20, 700, "Regional performance");
  const intro = el("P");
  two.mark("P", intro, [
    show(
      regular,
      12,
      72,
      672,
      "All three regions beat their revenue targets. The detailed figures",
    ),
  ]);
  const appendixLink = tree.element("Link", intro, second);
  two.line(72, 656, 12, [
    { tag: "P", owner: intro, font: regular, text: "are in the " },
    { tag: "Link", owner: appendixLink, font: regular, text: "appendix" },
    {
      tag: "P",
      owner: intro,
      font: regular,
      text: " at the end of this report.",
    },
  ]);

  block("H3", bold, 16, 620, "North America");
  two.mark("P", el("P"), [
    show(
      regular,
      12,
      72,
      598,
      "Revenue rose 18% to $4.2 million, driven by enterprise renewals",
    ),
    show(
      regular,
      12,
      72,
      582,
      "and the launch of the Atlas product line in Canada.",
    ),
  ]);

  block("H3", bold, 16, 548, "Europe");
  const europe = el("P");
  two.mark("P", europe, [
    show(
      regular,
      12,
      72,
      526,
      "Growth slowed to 6% as two large contracts moved into the fourth",
    ),
  ]);
  const quote = tree.element("Quote", europe, second);
  two.line(72, 510, 12, [
    {
      tag: "P",
      owner: europe,
      font: regular,
      text: "quarter. Our regional director called it ",
    },
    {
      tag: "Quote",
      owner: quote,
      font: italic,
      text: "“a timing issue, not a demand issue.”",
    },
  ]);
  const local = el("P");
  const term = tree.element("Span", local, second, {
    Lang: PDFString.of("de-DE"),
  });
  two.line(72, 488, 12, [
    {
      tag: "P",
      owner: local,
      font: regular,
      text: "German subsidiaries report this line as ",
    },
    { tag: "Span", owner: term, font: italic, text: "Umsatzerlöse" },
    { tag: "P", owner: local, font: regular, text: "." },
  ]);

  // H3 to H5: the skipped level a checker flags.
  block("H5", bold, 13, 456, "Outlook");
  // The RoleMap names no Callout: a custom role a checker reports as unmapped.
  block(
    "Callout",
    bold,
    14,
    434,
    "Pipeline for Q4 is up 25% on the same point last year.",
  );
  block("P", regular, 12, 408, "Priorities for next quarter:");
  const list = el("L", { A: ctx.obj({ O: "List", ListNumbering: "Decimal" }) });
  const priorities = [
    "Close the two delayed European contracts.",
    "Expand the Atlas pilot to three more enterprise customers.",
    "Hire a second account manager for the Canadian market.",
  ];
  priorities.forEach((text, i) => {
    const item = tree.element("LI", list, second);
    const y = 388 - i * 18;
    two.line(84, y, 12, [
      {
        tag: "Lbl",
        owner: tree.element("Lbl", item, second),
        font: regular,
        text: `${i + 1}.  `,
      },
      {
        tag: "LBody",
        owner: tree.element("LBody", item, second),
        font: regular,
        text,
      },
    ]);
  });

  block("H2", bold, 20, 306, "Appendix: method");
  block(
    "P",
    regular,
    12,
    282,
    "Figures come from the finance warehouse, using this query:",
  );
  two.mark("Code", el("Code"), [
    show(mono, 10, 84, 260, "SELECT region, SUM(amount) AS revenue"),
    show(mono, 10, 84, 246, "FROM invoices"),
    show(mono, 10, 84, 232, "WHERE quarter = '2026-Q3'"),
    show(mono, 10, 84, 218, "GROUP BY region;"),
  ]);
  block(
    "P",
    regular,
    12,
    192,
    "All amounts are in US dollars and exclude sales tax.",
  );

  // PDF/UA-1 (7.9) requires a Note to carry an ID.
  two.mark("Note", el("Note", { ID: PDFString.of("note-unaudited") }), [
    show(
      regular,
      9,
      72,
      96,
      "Note: these figures are unaudited and may change before the annual report.",
    ),
  ]);
  two.untagged([show(regular, 8, 72, 72, "Confidential - internal use only")]);
  two.artifact("/Type /Pagination", [show(regular, 10, 300, 40, "Page 2")]);
  two.writeTo(ctx, second);

  tree.finish(document);

  doc.catalog.set(PDFName.of("StructTreeRoot"), tree.rootRef);
  doc.catalog.set(PDFName.of("MarkInfo"), ctx.obj({ Marked: true }));
  doc.catalog.set(PDFName.of("Lang"), PDFString.of("en-US"));
  doc.setTitle("Quarterly report");

  const bytes = await doc.save();
  const out = join(__dirname, "tagged-sample.pdf");
  writeFileSync(out, bytes);
  console.log(`wrote ${out} (${bytes.length} bytes)`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
