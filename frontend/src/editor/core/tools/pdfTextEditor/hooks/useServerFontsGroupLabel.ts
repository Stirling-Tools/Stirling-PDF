import { useTranslation } from "react-i18next";

/** Heading for the fonts the backend supplies in the font picker; a seam for builds whose backend the user does not think of as a server. */
export function useServerFontsGroupLabel(): string {
  const { t } = useTranslation();
  return t("pdfTextEditor.fontPicker.serverGroup", "Server fonts");
}
