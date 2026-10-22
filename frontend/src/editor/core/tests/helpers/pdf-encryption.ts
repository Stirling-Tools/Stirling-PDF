import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
} from "@cantoo/pdf-lib";

/** Captures stored encryption and credential entries for comparison across saves; plain PDFs return an empty object. */
export async function readEncryptionDictionary(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const encryption = pdf.context.lookup(pdf.context.trailerInfo.Encrypt);
  const entries: Record<string, string | undefined> = {};
  if (!(encryption instanceof PDFDict)) return entries;
  for (const key of [
    "O",
    "U",
    "OE",
    "UE",
    "Perms",
    "P",
    "R",
    "V",
    "Length",
    "EncryptMetadata",
  ]) {
    const value = encryption.get(PDFName.of(key));
    entries[key] =
      value instanceof PDFHexString || value instanceof PDFString
        ? Buffer.from(value.asBytes()).toString("hex")
        : value?.toString();
    // Signed and unsigned PDF integers can encode the same 32 permission bits.
    if (key === "P" && value)
      entries[key] = String(Number(value.toString()) | 0);
  }
  const ids = pdf.context.lookup(pdf.context.trailerInfo.ID);
  const id = ids instanceof PDFArray ? ids.get(0) : undefined;
  if (id instanceof PDFHexString || id instanceof PDFString)
    entries.ID = Buffer.from(id.asBytes()).toString("hex");
  return entries;
}
