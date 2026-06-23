import { BASE_PATH } from "@app/constants/app";
import { getLogoFolder } from "@app/constants/logo";
import type { LogoVariant } from "@app/services/preferencesService";
import type { TFunction } from "i18next";
import { loginSlideText } from "@shared/auth/ui/loginSlideText";
import type { ImageSlide } from "@shared/auth/ui/LoginRightCarousel";
import addToPdf from "@shared/assets/login/AddToPDF.png";
import securePdf from "@shared/assets/login/SecurePDF.png";

const SLIDE_TILT = { followMouseTilt: true, tiltMaxDeg: 5 } as const;

/**
 * Editor login carousel slides. Copy comes from the shared set (so the editor
 * and portal carousels stay in sync) and the edit/secure images are the shared
 * bundled assets; only the hero is the logo-variant image the editor serves
 * from /public.
 */
export const buildLoginSlides = (
  variant: LogoVariant | null | undefined,
  t: TFunction,
): ImageSlide[] => {
  const folder = getLogoFolder(variant);
  const text = loginSlideText((key, fallback) => t(key, fallback));
  const srcs = [`${BASE_PATH}/${folder}/Firstpage.png`, addToPdf, securePdf];
  return srcs.map((src, i) => ({ src, ...text[i], ...SLIDE_TILT }));
};

export default buildLoginSlides;
