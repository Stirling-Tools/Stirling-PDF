import {
  detectLanguage,
  type LanguageDetection,
} from "@app/services/languageDetection/detectLanguage";

/** Where a document language came from, so the UI can say "detected" or "tagged". */
export type DocumentLanguageSource = "metadata" | "text" | "none";

export interface DocumentLanguage {
  detection: LanguageDetection;
  source: DocumentLanguageSource;
  /** The document's own BCP 47 tag when the PDF carried one. */
  tag: string | null;
}

const MAX_SAMPLE_CHARS = 20_000;

/**
 * Narrow a PDF language tag to its region-free ISO 639-1 code.
 *
 * PDF producers write `/Lang` as a BCP 47 tag ("en-GB", "pt-BR"). Anything
 * malformed or marked "und" (undetermined) is treated as absent rather than
 * passed to the voice picker as if it were a language.
 */
export function languageCodeFromTag(tag: unknown): string | null {
  if (typeof tag !== "string") return null;
  const trimmed = tag.trim();
  if (trimmed.length === 0 || trimmed.toLowerCase() === "und") return null;
  try {
    const code = new Intl.Locale(trimmed.replace(/_/g, "-")).language;
    return /^[a-z]{2,3}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

/**
 * Sample text from the first pages for language identification.
 *
 * A cap keeps a pathological page from turning a voice choice into a long
 * synchronous scan; the detector only needs a few sentences.
 */
export function sampleTextForDetection(pages: readonly string[]): string {
  let out = "";
  for (const page of pages) {
    if (out.length >= MAX_SAMPLE_CHARS) break;
    const remaining = MAX_SAMPLE_CHARS - out.length;
    out += page.slice(0, remaining);
    if (out.length >= MAX_SAMPLE_CHARS) break;
    out += "\n\n";
  }
  return out;
}

/**
 * Prefer the PDF's own language tag, then fall back to identifying its text.
 *
 * The tag is authoritative when present: a bilingual document's first page can
 * easily look like the wrong language, while the producer already declared what
 * the document is.
 */
export function detectDocumentLanguage(
  sampledText: string,
  metadataTag?: unknown,
): DocumentLanguage {
  const tag = languageCodeFromTag(metadataTag);
  if (tag != null) {
    return {
      detection: {
        language: tag,
        script: null,
        candidates: [{ language: tag, score: 1 }],
        assumed: false,
        lowText: false,
      },
      source: "metadata",
      tag: typeof metadataTag === "string" ? metadataTag : null,
    };
  }

  const detection = detectLanguage(sampledText);
  return {
    detection,
    source: detection.language == null ? "none" : "text",
    tag: null,
  };
}
