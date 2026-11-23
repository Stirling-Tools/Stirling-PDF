import type { PDFDocument, PDFFont, PDFPage } from "@cantoo/pdf-lib";
import { PAGE_SIZES } from "@editor/constants/pageSizeConstants";

export type NewPdfPageSize = "A4" | "LETTER" | "LEGAL" | "A5";

export const NEW_PDF_PAGE_SIZES: readonly NewPdfPageSize[] = [
  "A4",
  "LETTER",
  "LEGAL",
  "A5",
];

export type NewPdfOrientation = "portrait" | "landscape";

export const NEW_PDF_ORIENTATIONS: readonly NewPdfOrientation[] = [
  "portrait",
  "landscape",
];

export interface NewPdfPageSetup {
  size: NewPdfPageSize;
  orientation: NewPdfOrientation;
}

export type PdfTemplateCategory =
  | "paper"
  | "documents"
  | "business"
  | "forms"
  | "planning"
  | "design";

export interface PdfTemplate {
  id: string;
  category: PdfTemplateCategory;
  title: string;
  keywords?: string;
  body: string;
}

const LETTER_SIZE_REGIONS = new Set(["US", "CA", "MX", "PH", "CL", "CO"]);

export function defaultPageSizeFor(locale: string | undefined): NewPdfPageSize {
  const region = locale?.split(/[-_]/)[1]?.toUpperCase();
  return region && LETTER_SIZE_REGIONS.has(region) ? "LETTER" : "A4";
}

type Align = "left" | "center" | "right";
type Colour = [number, number, number];

interface TextStyle {
  size: number;
  bold?: boolean;
  colour?: Colour;
}

const INK: Colour = [0.13, 0.13, 0.15];
const MUTED: Colour = [0.42, 0.42, 0.46];
const RULE: Colour = [0.82, 0.82, 0.85];
const ACCENT: Colour = [0.15, 0.33, 0.62];
const SHADE: Colour = [0.95, 0.96, 0.97];
const PAPER: Colour = [1, 1, 1];

const STYLE = {
  display: { size: 34, bold: true },
  title: { size: 22, bold: true },
  heading: { size: 13, bold: true, colour: ACCENT },
  label: { size: 9, bold: true, colour: MUTED },
  strong: { size: 11, bold: true },
  muted: { size: 10, colour: MUTED },
  body: { size: 11 },
  cell: { size: 10 },
  bandTitle: { size: 24, bold: true, colour: PAPER },
  bandSubtitle: { size: 11, colour: PAPER },
} satisfies Record<string, TextStyle>;

type Rgb = typeof import("@cantoo/pdf-lib").rgb;

interface Region {
  top: number;
  right: { x: number; width: number };
  bottom: number;
  restore: { x: number; width: number };
}

interface Pen {
  doc: PDFDocument;
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  rgb: Rgb;
  size: [number, number];
  margin: number;
  x: number;
  width: number;
  y: number;
  region?: Region;
}

function pageDimensions({
  size,
  orientation,
}: NewPdfPageSetup): [number, number] {
  const { width, height } = PAGE_SIZES[size];
  return orientation === "landscape" ? [height, width] : [width, height];
}

export async function createBlankPdf(setup: NewPdfPageSetup): Promise<File> {
  const { PDFDocument } = await import("@cantoo/pdf-lib");
  const doc = await PDFDocument.create();
  doc.addPage(pageDimensions(setup));
  return toFile(await doc.save(), "Untitled.pdf");
}

export async function createPdfFromTemplate(
  template: PdfTemplate,
  setup: NewPdfPageSetup,
): Promise<File> {
  const { PDFDocument, StandardFonts, rgb } = await import("@cantoo/pdf-lib");
  const doc = await PDFDocument.create();
  const pen = startPage({
    doc,
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    rgb,
    size: pageDimensions(setup),
  });
  renderBody(
    pen,
    template.body.split("\n").map((line) => line.trim()),
  );
  doc.setTitle(template.title);
  return toFile(await doc.save(), `${template.title}.pdf`);
}

function toFile(bytes: Uint8Array, name: string): File {
  return new File([bytes as BlobPart], name, { type: "application/pdf" });
}

function startPage(
  base: Pick<Pen, "doc" | "regular" | "bold" | "rgb" | "size">,
): Pen {
  const [width, height] = base.size;
  const margin = Math.round(Math.min(64, Math.max(36, width * 0.09)));
  return {
    doc: base.doc,
    regular: base.regular,
    bold: base.bold,
    rgb: base.rgb,
    size: base.size,
    page: base.doc.addPage(base.size),
    margin,
    x: margin,
    width: width - margin * 2,
    y: height - margin,
  };
}

function ensureSpace(pen: Pen, height: number) {
  if (pen.y - height >= pen.margin) return;
  Object.assign(pen, startPage(pen), { region: undefined });
}

function renderBody(pen: Pen, lines: string[]) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("|")) {
      const start = i;
      while (i + 1 < lines.length && lines[i + 1].startsWith("|")) i++;
      renderTable(pen, lines.slice(start, i + 1));
    } else if (lines[i].startsWith("@")) {
      renderDirective(pen, lines[i].slice(1));
    } else {
      renderLine(pen, lines[i]);
    }
  }
}

function renderDirective(pen: Pen, directive: string) {
  const [name, ...rest] = directive.split(" ");
  const argument = rest.join(" ");
  switch (name) {
    case "page":
      return Object.assign(pen, startPage(pen), { region: undefined });
    case "space":
      return void (pen.y -= argument.endsWith("%")
        ? (pen.size[1] * parseFloat(argument)) / 100
        : parseFloat(argument));
    case "band":
      return drawBand(pen, argument);
    case "border":
      return drawBorder(pen);
    case "lined":
      return drawLined(pen);
    case "dots":
      return drawDots(pen);
    case "boxes":
      return drawBoxes(pen, argument);
    case "columns":
      return beginColumns(pen, parseFloat(argument), false);
    case "sidebar":
      return beginColumns(pen, parseFloat(argument), true);
    case "next":
      return nextColumn(pen);
    case "end":
      return endColumns(pen);
  }
}

function renderLine(pen: Pen, raw: string) {
  if (!raw) {
    pen.y -= 8;
    return;
  }
  let line = raw;
  let align: Align = "left";
  if (line.startsWith("^ ")) {
    align = "center";
    line = line.slice(2);
  } else if (line.startsWith("> ")) {
    align = "right";
    line = line.slice(2);
  }

  if (line === "---") return drawRule(pen);
  if (line.startsWith("_ ")) return drawSignatures(pen, line.slice(2));
  if (line.startsWith(": ")) return drawFields(pen, line.slice(2));
  if (line.startsWith("[ ] ")) return drawCheckbox(pen, line.slice(4));
  if (line.startsWith("- ")) return drawBullet(pen, line.slice(2));

  const [style, text, spaceBefore, spaceAfter] = blockStyle(line);
  pen.y -= spaceBefore;
  writeWrapped(pen, text, style, { align });
  pen.y -= spaceAfter;
}

function blockStyle(line: string): [TextStyle, string, number, number] {
  if (line.startsWith("= ")) return [STYLE.display, line.slice(2), 0, 10];
  if (line.startsWith("# ")) return [STYLE.title, line.slice(2), 0, 8];
  if (line.startsWith("## ")) return [STYLE.heading, line.slice(3), 6, 4];
  if (line.startsWith("### "))
    return [STYLE.label, line.slice(4).toUpperCase(), 4, 4];
  if (line.startsWith("! ")) return [STYLE.strong, line.slice(2), 0, 0];
  if (line.startsWith("~ ")) return [STYLE.muted, line.slice(2), 0, 0];
  return [STYLE.body, line, 0, 2];
}

function fontFor(pen: Pen, style: TextStyle) {
  return style.bold ? pen.bold : pen.regular;
}

function draw(
  pen: Pen,
  text: string,
  style: TextStyle,
  x: number,
  width: number,
  align: Align,
) {
  const font = fontFor(pen, style);
  const textWidth = font.widthOfTextAtSize(text, style.size);
  const offset =
    align === "center"
      ? (width - textWidth) / 2
      : align === "right"
        ? width - textWidth
        : 0;
  pen.page.drawText(text, {
    x: x + offset,
    y: pen.y - style.size,
    size: style.size,
    font,
    color: pen.rgb(...(style.colour ?? INK)),
  });
}

function writeWrapped(
  pen: Pen,
  text: string,
  style: TextStyle,
  { indent = 0, align = "left" }: { indent?: number; align?: Align },
) {
  const width = pen.width - indent;
  const lineHeight = style.size * 1.4;
  for (const line of wrap(text, fontFor(pen, style), style.size, width)) {
    ensureSpace(pen, lineHeight);
    draw(pen, line, style, pen.x + indent, width, align);
    pen.y -= lineHeight;
  }
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > width) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function line(
  pen: Pen,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  colour: Colour,
  thickness = 0.75,
) {
  pen.page.drawLine({
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    thickness,
    color: pen.rgb(...colour),
  });
}

function drawRule(pen: Pen) {
  ensureSpace(pen, 16);
  pen.y -= 6;
  line(pen, pen.x, pen.y, pen.x + pen.width, pen.y, RULE);
  pen.y -= 10;
}

function drawBullet(pen: Pen, text: string) {
  ensureSpace(pen, 16);
  draw(pen, "•", STYLE.body, pen.x + 2, 10, "left");
  writeWrapped(pen, text, STYLE.body, { indent: 14 });
  pen.y -= 1;
}

function drawCheckbox(pen: Pen, text: string) {
  ensureSpace(pen, 18);
  pen.page.drawRectangle({
    x: pen.x,
    y: pen.y - 10,
    width: 9,
    height: 9,
    borderColor: pen.rgb(...MUTED),
    borderWidth: 0.75,
  });
  writeWrapped(pen, text, STYLE.body, { indent: 16 });
  pen.y -= 4;
}

function splitColumns(text: string) {
  return text.split("|").map((part) => part.trim());
}

function drawSignatures(pen: Pen, labels: string) {
  const parts = splitColumns(labels);
  const column = pen.width / parts.length;
  ensureSpace(pen, 48);
  pen.y -= 30;
  parts.forEach((label, index) => {
    const x = pen.x + column * index;
    line(pen, x, pen.y, x + Math.min(220, column - 24), pen.y, MUTED);
    pen.y -= 4;
    draw(pen, label, STYLE.label, x, column, "left");
    pen.y += 4;
  });
  pen.y -= 22;
}

function drawFields(pen: Pen, labels: string) {
  const parts = splitColumns(labels);
  const gap = 16;
  const column = (pen.width - gap * (parts.length - 1)) / parts.length;
  ensureSpace(pen, 40);
  pen.y -= 6;
  parts.forEach((label, index) => {
    const x = pen.x + (column + gap) * index;
    draw(pen, label.toUpperCase(), STYLE.label, x, column, "left");
    line(pen, x, pen.y - 30, x + column, pen.y - 30, MUTED);
  });
  pen.y -= 42;
}

function drawBand(pen: Pen, text: string) {
  const [title, subtitle] = splitColumns(text);
  const [pageWidth, pageHeight] = pen.size;
  const atTop = pen.y >= pageHeight - pen.margin;
  const height = subtitle ? 92 : 72;
  const top = atTop ? pageHeight : pen.y;
  const x = pen.region ? pen.x : 0;
  const width = pen.region ? pen.width : pageWidth;
  pen.page.drawRectangle({
    x,
    y: top - height,
    width,
    height,
    color: pen.rgb(...ACCENT),
  });
  pen.y = top - (height - STYLE.bandTitle.size - (subtitle ? 22 : 0)) / 2;
  draw(pen, title, STYLE.bandTitle, pen.x, pen.width, "left");
  if (subtitle) {
    pen.y -= STYLE.bandTitle.size + 10;
    draw(pen, subtitle, STYLE.bandSubtitle, pen.x, pen.width, "left");
  }
  pen.y = top - height - (atTop ? pen.margin * 0.6 : 16);
}

function drawBorder(pen: Pen) {
  const [width, height] = pen.size;
  const inset = Math.min(width, height) * 0.045;
  pen.page.drawRectangle({
    x: inset,
    y: inset,
    width: width - inset * 2,
    height: height - inset * 2,
    borderColor: pen.rgb(...ACCENT),
    borderWidth: 2.5,
  });
  pen.page.drawRectangle({
    x: inset + 6,
    y: inset + 6,
    width: width - inset * 2 - 12,
    height: height - inset * 2 - 12,
    borderColor: pen.rgb(...ACCENT),
    borderWidth: 0.75,
  });
}

function drawLined(pen: Pen) {
  for (let y = pen.y - 24; y >= pen.margin; y -= 24) {
    line(pen, pen.x, y, pen.x + pen.width, y, RULE, 0.5);
  }
  pen.y = pen.margin;
}

function drawDots(pen: Pen) {
  const step = 18;
  const columns = Math.floor(pen.width / step);
  const left = pen.x + (pen.width - columns * step) / 2;
  for (let y = pen.y - step / 2; y >= pen.margin; y -= step) {
    for (let column = 0; column <= columns; column++) {
      pen.page.drawCircle({
        x: left + column * step,
        y,
        size: 0.8,
        color: pen.rgb(...RULE),
      });
    }
  }
  pen.y = pen.margin;
}

function drawBoxes(pen: Pen, spec: string) {
  const [rowSpec, ...headings] = splitColumns(spec);
  const rows = Math.max(1, parseInt(rowSpec, 10) || 1);
  pen.y -= 10;
  const header = 20;
  const height = (pen.y - pen.margin - header) / rows;
  const width = pen.width / headings.length;
  headings.forEach((heading, column) => {
    draw(
      pen,
      heading.toUpperCase(),
      STYLE.label,
      pen.x + width * column,
      width,
      "center",
    );
  });
  const top = pen.y - header + 4;
  const bottom = top - height * rows;
  for (let row = 0; row <= rows; row++) {
    line(
      pen,
      pen.x,
      top - height * row,
      pen.x + pen.width,
      top - height * row,
      RULE,
    );
  }
  for (let column = 0; column <= headings.length; column++) {
    line(
      pen,
      pen.x + width * column,
      top,
      pen.x + width * column,
      bottom,
      RULE,
    );
  }
  pen.y = bottom - 8;
}

function beginColumns(pen: Pen, percent: number, shaded: boolean) {
  const [, pageHeight] = pen.size;
  const gap = shaded ? pen.margin : 24;
  const restore = { x: pen.x, width: pen.width };
  const leftWidth = shaded
    ? (pen.size[0] * percent) / 100 - pen.margin - gap / 2
    : (pen.width - gap) * (percent / 100);
  if (shaded) {
    pen.page.drawRectangle({
      x: 0,
      y: 0,
      width: (pen.size[0] * percent) / 100,
      height: pageHeight,
      color: pen.rgb(...SHADE),
    });
  }
  const rightX = pen.x + leftWidth + gap;
  pen.region = {
    top: pen.y,
    right: { x: rightX, width: restore.x + restore.width - rightX },
    bottom: pen.y,
    restore,
  };
  pen.width = leftWidth;
}

function nextColumn(pen: Pen) {
  if (!pen.region) return;
  pen.region.bottom = Math.min(pen.region.bottom, pen.y);
  pen.x = pen.region.right.x;
  pen.width = pen.region.right.width;
  pen.y = pen.region.top;
}

function endColumns(pen: Pen) {
  if (!pen.region) return;
  pen.y = Math.min(pen.region.bottom, pen.y);
  pen.x = pen.region.restore.x;
  pen.width = pen.region.restore.width;
  pen.region = undefined;
}

function cellsOf(row: string) {
  return row
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function columnWidths(count: number, total: number) {
  if (count === 1) return [total];
  if (count === 2) return [total * 0.34, total * 0.66];
  const first = total * 0.44;
  return [first, ...Array(count - 1).fill((total - first) / (count - 1))];
}

function cellStyle(cell: string, header: boolean): [TextStyle, string] {
  if (header) return [{ ...STYLE.cell, bold: true }, cell];
  if (cell.startsWith("! "))
    return [{ ...STYLE.cell, bold: true }, cell.slice(2)];
  if (cell.startsWith("~ "))
    return [{ ...STYLE.cell, colour: MUTED }, cell.slice(2)];
  return [STYLE.cell, cell];
}

function renderTable(pen: Pen, rows: string[]) {
  const isSeparator = (row: string) => /^\|\s*-{3}/.test(row);
  const count = Math.max(
    ...rows
      .filter((row) => !isSeparator(row))
      .map((row) => cellsOf(row).length),
  );
  const widths = columnWidths(count, pen.width);
  rows.forEach((row, index) => {
    if (isSeparator(row)) {
      pen.y += 6;
      drawRule(pen);
      return;
    }
    const header = index === 0 && isSeparator(rows[1] ?? "");
    ensureSpace(pen, 18);
    let x = pen.x;
    cellsOf(row).forEach((cell, column) => {
      const [style, text] = cellStyle(cell, header);
      const last = column === count - 1;
      const align: Align = count >= 3 && last ? "right" : "left";
      draw(pen, text, style, x, widths[column] - (last ? 0 : 8), align);
      x += widths[column];
    });
    pen.y -= 17;
  });
  pen.y -= 6;
}
