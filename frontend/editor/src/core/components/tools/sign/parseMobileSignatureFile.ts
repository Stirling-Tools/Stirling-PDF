import { readFileAsDataUrl } from "@app/utils/fileUtils";
import type { MobileSignaturePayload } from "@app/components/tools/sign/MobileSignatureModal";

const TEXT_FONTS = new Set([
  "Helvetica",
  "Times-Roman",
  "Courier",
  "Arial",
  "Georgia",
]);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_TEXT_LENGTH = 200;

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function isTextPayload(file: File) {
  return (
    file.type === "application/json" && file.name.startsWith("signature-text")
  );
}

async function readTextPayload(
  file: File,
): Promise<MobileSignaturePayload | null> {
  try {
    const record: Record<string, unknown> =
      JSON.parse(await readFileAsText(file)) ?? {};
    const text = stringField(record, "text").trim().slice(0, MAX_TEXT_LENGTH);
    if (!text) return null;
    const fontFamily = stringField(record, "fontFamily");
    const color = stringField(record, "color");
    return {
      kind: "text",
      text,
      fontFamily: TEXT_FONTS.has(fontFamily) ? fontFamily : "Helvetica",
      color: HEX_COLOR.test(color) ? color : "#000000",
    };
  } catch {
    console.warn("[MobileSignature] Ignoring malformed text payload");
    return null;
  }
}

export async function parseMobileSignatureFile(
  file: File,
): Promise<MobileSignaturePayload | null> {
  if (isTextPayload(file)) return readTextPayload(file);
  if (!file.type.startsWith("image/")) {
    console.warn("[MobileSignature] Ignoring non-image upload:", file.type);
    return null;
  }
  const dataUrl = await readFileAsDataUrl(file).catch(() => null);
  if (!dataUrl) return null;
  const kind = file.name.startsWith("signature-photo") ? "photo" : "draw";
  return { kind, dataUrl };
}
