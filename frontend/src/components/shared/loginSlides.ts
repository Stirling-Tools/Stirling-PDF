import { BASE_PATH } from '../../constants/app';

export type LoginCarouselSlide = {
  src: string
  alt?: string
  title?: string
  subtitle?: string
  cornerModelUrl?: string
  followMouseTilt?: boolean
  tiltMaxDeg?: number
}

export const loginSlides: LoginCarouselSlide[] = [
  {
    src: `${BASE_PATH}/Login/Firstpage.png`,
    alt: 'Stirling PDF overview',
    title: 'Your one-stop-shop for all your PDF needs.',
    subtitle:
      'A privacy-first cloud suite for PDFs that lets you convert, sign, redact, and manage documents, along with 50+ other powerful tools.',
    followMouseTilt: true,
    tiltMaxDeg: 5,
  },
  {
    src: `${BASE_PATH}/Login/AddToPDF.png`,
    alt: 'Edit PDFs',
    title: 'Edit PDFs to display/secure the information you want',
    subtitle:
      'With over a dozen tools to help you redact, sign, read and manipulate PDFs, you will be sure to find what you are looking for.',
    followMouseTilt: true,
    tiltMaxDeg: 5,
  },
  {
    src: `${BASE_PATH}/Login/SecurePDF.png`,
    alt: 'Secure PDFs',
    title: 'Protect sensitive information in your PDFs',
    subtitle:
      'Add passwords, redact content, and manage certificates with ease.',
    followMouseTilt: true,
    tiltMaxDeg: 5,
  },
]

export default loginSlides
