import { getPdfAccess } from "@editor/services/pdfAccessService";
import { looksEncryptedFromTrailer } from "@editor/utils/pdfEncryptionProbe";

export class FileAnalyzer {
  /** Admission hint only: never grants access. Authentication waits until the file is opened. */
  static async isPDFEncrypted(file: File): Promise<boolean> {
    const access = getPdfAccess(file);
    if (access) return access.encrypted;
    return looksEncryptedFromTrailer(file);
  }

  /** Magic-byte check; parsing validity is decided when the document opens. */
  static async isValidPDF(file: File): Promise<boolean> {
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      return false;
    }

    try {
      const header = file.slice(0, 8);
      const headerBytes = new Uint8Array(await header.arrayBuffer());
      return String.fromCharCode(...headerBytes).startsWith("%PDF-");
    } catch {
      return false;
    }
  }
}
