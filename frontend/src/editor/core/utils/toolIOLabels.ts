import { type TFunction } from "i18next";
import { type ToolFormat } from "@app/types/toolIO";

/**
 * A tool format as a phrase to show someone, not the enum name. `PDF_ENCRYPTED` is a wire value;
 * the reader sees "a password-protected PDF".
 */
export const getToolFormatLabel = (t: TFunction, format: ToolFormat): string =>
  t(`toolFormat.${format}`);

/**
 * Several formats as one phrase, joined the way the reader's language joins alternatives:
 * "a PDF or an image".
 */
export function getToolFormatListLabel(
  t: TFunction,
  language: string,
  formats: ToolFormat[],
): string {
  const labels = formats.map((format) => getToolFormatLabel(t, format));
  return new Intl.ListFormat(language, {
    style: "long",
    type: "disjunction",
  }).format(labels);
}
