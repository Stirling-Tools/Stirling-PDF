import { defaultTranslate, type AuthTranslate } from "@shared/auth/types";

export type LoginSlideText = {
  alt: string;
  title: string;
  subtitle: string;
};

/**
 * Shared carousel copy (i18n-optional, English default). The editor and portal
 * both build their slides from this so the text stays in sync; only the images
 * differ (the editor swaps the hero for its logo-variant image). Order matches
 * buildDefaultLoginSlides: [overview, edit, secure].
 *
 * Kept image-free on purpose: the editor imports this without dragging the
 * bundled slide images into its build.
 */
export function loginSlideText(
  translate: AuthTranslate = defaultTranslate,
): LoginSlideText[] {
  return [
    {
      alt: translate("login.slides.overview.alt", "Stirling PDF overview"),
      title: translate(
        "login.slides.overview.title",
        "Your one-stop-shop for all your PDF needs.",
      ),
      subtitle: translate(
        "login.slides.overview.subtitle",
        "A privacy-first cloud suite for PDFs that lets you convert, sign, redact, and manage documents, along with 50+ other powerful tools.",
      ),
    },
    {
      alt: translate("login.slides.edit.alt", "Edit PDFs"),
      title: translate(
        "login.slides.edit.title",
        "Edit PDFs to display/secure the information you want",
      ),
      subtitle: translate(
        "login.slides.edit.subtitle",
        "With over a dozen tools to help you redact, sign, read and manipulate PDFs, you will be sure to find what you are looking for.",
      ),
    },
    {
      alt: translate("login.slides.secure.alt", "Secure PDFs"),
      title: translate(
        "login.slides.secure.title",
        "Protect sensitive information in your PDFs",
      ),
      subtitle: translate(
        "login.slides.secure.subtitle",
        "Add passwords, redact content, and manage certificates with ease.",
      ),
    },
  ];
}
