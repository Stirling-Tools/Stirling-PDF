import { dictKeys, type RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import { parseOps } from "@editor/tools/pdfTextEditor/pdfdoc/contentOps";
import { toLatin1 } from "@editor/tools/pdfTextEditor/pdfdoc/bytes";

export async function unnamedFontDrawOrder(
  pdf: RawPdf,
): Promise<Map<number, Array<string | null>>> {
  const out = new Map<number, Array<string | null>>();
  if (pdf.encrypted) return out;
  const pages = pdf.pageNumbers();
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const resources = pdf.pageInherited(pages[pageIndex], "Resources");
    const fonts = resources ? pdf.resolve(resources, "Font") : null;
    if (!fonts) continue;
    const names = descriptorNames(pdf, fonts);
    if (![...names.values()].some((name) => name !== null)) continue;
    const content = await pdf.pageContent(pages[pageIndex]);
    if (content) out.set(pageIndex, drawOrder(toLatin1(content), names));
  }
  return out;
}

function descriptorNames(
  pdf: RawPdf,
  fonts: string,
): Map<string, string | null> {
  const names = new Map<string, string | null>();
  for (const key of dictKeys(fonts) ?? []) {
    const font = pdf.resolve(fonts, key);
    names.set(key, font ? descriptorNameOf(pdf, font) : null);
  }
  return names;
}

function descriptorNameOf(pdf: RawPdf, font: string): string | null {
  if (pdf.valueSpan(font, "BaseFont")) return null;
  const descriptor = pdf.resolve(font, "FontDescriptor");
  const name = descriptor ? pdf.dictName(descriptor, "FontName") : null;
  return name ? decodeName(name) : null;
}

function decodeName(name: string): string {
  return name.replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

const isString = (token: string) =>
  token.startsWith("(") || (token.startsWith("<") && !token.startsWith("<<"));

const isEmptyString = (token: string) =>
  token === "()" || /^<\s*>$/.test(token);

function createsTextObject(op: string, operands: string[]): boolean {
  if (op === "TJ")
    return operands.some((token) => isString(token) && !isEmptyString(token));
  if (op === "Tj" || op === "'" || op === '"') {
    const shown = operands[operands.length - 1];
    return !!shown && isString(shown) && !isEmptyString(shown);
  }
  return false;
}

function drawOrder(
  content: string,
  names: Map<string, string | null>,
): Array<string | null> {
  const order: Array<string | null> = [];
  const saved: Array<string | null | undefined> = [];
  let font: string | null | undefined;
  for (const { op, operands } of parseOps(content)) {
    if (op === "q") saved.push(font);
    else if (op === "Q") font = saved.length > 0 ? saved.pop() : font;
    else if (op === "Tf" && operands.length >= 1)
      font = names.get(decodeName(operands[0].slice(1))) ?? null;
    else if (font !== undefined && createsTextObject(op, operands))
      order.push(font);
  }
  return order;
}
