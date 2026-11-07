import type { PDFDict as PdfDictionary } from "@cantoo/pdf-lib";

/**
 * Describes the cipher an encrypted PDF uses, which its security revision alone does not fix
 * (R3 allows several RC4 key lengths, R4 allows RC4 or AES-128). Undefined when unreadable.
 */
export async function readCipherProfile(
  file: Blob,
): Promise<string | undefined> {
  try {
    const { PDFDict, PDFDocument, PDFName } = await import("@cantoo/pdf-lib");
    const pdf = await PDFDocument.load(await file.arrayBuffer(), {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    const encryption = pdf.context.lookup(pdf.context.trailerInfo.Encrypt);
    if (!(encryption instanceof PDFDict)) return undefined;
    const entry = (dict: PdfDictionary | undefined, key: string) =>
      dict?.get(PDFName.of(key))?.toString();
    const filters = encryption.lookup(PDFName.of("CF"));
    const cryptFilter = (name: string | undefined) => {
      const filter =
        filters instanceof PDFDict && name
          ? filters.lookup(PDFName.of(name.replace(/^\//, "")))
          : undefined;
      return filter instanceof PDFDict
        ? `${entry(filter, "CFM")}:${entry(filter, "Length")}`
        : name;
    };
    return [
      entry(encryption, "Filter"),
      entry(encryption, "V"),
      entry(encryption, "Length") ?? "40",
      cryptFilter(entry(encryption, "StmF")),
      cryptFilter(entry(encryption, "StrF")),
      entry(encryption, "EncryptMetadata") ?? "true",
    ].join("|");
  } catch {
    return undefined;
  }
}
