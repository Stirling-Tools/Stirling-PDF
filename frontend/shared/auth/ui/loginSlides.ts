import { defaultTranslate, type AuthTranslate } from "@shared/auth/types";
import type { ImageSlide } from "@shared/auth/ui/LoginRightCarousel";
import { loginSlideText } from "@shared/auth/ui/loginSlideText";
import firstPage from "@shared/assets/login/Firstpage.png";
import addToPdf from "@shared/assets/login/AddToPDF.png";
import securePdf from "@shared/assets/login/SecurePDF.png";

const SLIDE_TILT = { followMouseTilt: true, tiltMaxDeg: 5 } as const;

/**
 * Default login carousel slides using bundled images. The portal uses this set;
 * the editor builds its own (logo-variant hero) from loginSlideText.
 */
export function buildDefaultLoginSlides(
  translate: AuthTranslate = defaultTranslate,
): ImageSlide[] {
  const text = loginSlideText(translate);
  return [firstPage, addToPdf, securePdf].map((src, i) => ({
    src,
    ...text[i],
    ...SLIDE_TILT,
  }));
}
