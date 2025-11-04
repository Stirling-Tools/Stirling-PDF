import apiClient from '@app/services/apiClient';

const LANGUAGE_MAP: Record<string, string> = {
  en: 'eng',
  fr: 'fra',
  de: 'deu',
  es: 'spa',
  it: 'ita',
  pt: 'por',
  nl: 'nld',
  sv: 'swe',
  fi: 'fin',
  da: 'dan',
  no: 'nor',
  cs: 'ces',
  pl: 'pol',
  ru: 'rus',
  ja: 'jpn',
  ko: 'kor',
  zh: 'chi_sim',
};

function detectOcrLanguage(): string {
  if (typeof navigator === 'undefined') {
    return 'eng';
  }
  const locale = navigator.language?.toLowerCase() ?? 'en';
  const short = locale.split('-')[0];
  return LANGUAGE_MAP[short] || 'eng';
}

export async function runOcrForChat(file: File): Promise<File> {
  const language = detectOcrLanguage();
  const formData = new FormData();
  formData.append('fileInput', file, file.name);
  formData.append('languages', language);
  formData.append('ocrType', 'skip-text');
  formData.append('ocrRenderType', 'sandwich');
  formData.append('sidecar', 'false');
  formData.append('deskew', 'false');
  formData.append('clean', 'false');
  formData.append('cleanFinal', 'false');
  formData.append('removeImagesAfter', 'false');

  const response = await apiClient.post<Blob>(
    '/api/v1/misc/ocr-pdf',
    formData,
    {
      responseType: 'blob',
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );

  const blob = response.data;
  const head = await blob.slice(0, 5).text().catch(() => '');
  if (!head.startsWith('%PDF')) {
    throw new Error('OCR service did not return a valid PDF response.');
  }

  const safeName = file.name.replace(/\.pdf$/i, '');
  const outputName = `${safeName || 'ocr'}_chat.pdf`;
  return new File([blob], outputName, { type: 'application/pdf' });
}
