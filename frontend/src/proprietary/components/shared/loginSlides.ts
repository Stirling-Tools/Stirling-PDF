import { BASE_PATH } from '@app/constants/app';
import { getLogoFolder } from '@app/constants/logo';
import type { LogoVariant } from '@app/services/preferencesService';
import type { TFunction } from 'i18next';

export type LoginCarouselSlide = {
  src: string;
  alt?: string;
  title?: string;
  subtitle?: string;
  cornerModelUrl?: string;
  followMouseTilt?: boolean;
  tiltMaxDeg?: number;
};

export const buildLoginSlides = (
  variant: LogoVariant | null | undefined,
  t: TFunction
): LoginCarouselSlide[] => {
  const folder = getLogoFolder(variant);
  const heroImage = `${BASE_PATH}/${folder}/Firstpage.png`;

  return [
    {
      src: heroImage,
      alt: t('login.slides.overview.alt', 'Stirling PDF overview'),
      title: t('login.slides.overview.title', 'Your one-stop-shop for all your PDF needs.'),
      subtitle: t(
        'login.slides.overview.subtitle',
        'A privacy-first cloud suite for PDFs that lets you convert, sign, redact, and manage documents, along with 50+ other powerful tools.'
      ),
      followMouseTilt: true,
      tiltMaxDeg: 5,
    },
    {
      src: `${BASE_PATH}/Login/AddToPDF.png`,
      alt: t('login.slides.edit.alt', 'Edit PDFs'),
      title: t('login.slides.edit.title', 'Edit PDFs to display/secure the information you want'),
      subtitle: t(
        'login.slides.edit.subtitle',
        'With over a dozen tools to help you redact, sign, read and manipulate PDFs, you will be sure to find what you are looking for.'
      ),
      followMouseTilt: true,
      tiltMaxDeg: 5,
    },
    {
      src: `${BASE_PATH}/Login/SecurePDF.png`,
      alt: t('login.slides.secure.alt', 'Secure PDFs'),
      title: t('login.slides.secure.title', 'Protect sensitive information in your PDFs'),
      subtitle: t(
        'login.slides.secure.subtitle',
        'Add passwords, redact content, and manage certificates with ease.'
      ),
      followMouseTilt: true,
      tiltMaxDeg: 5,
    },
  ];
};

export default buildLoginSlides;
