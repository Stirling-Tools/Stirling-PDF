import { SignParameters } from '@app/hooks/tools/sign/useSignParameters';
import { HORIZONTAL_PADDING_RATIO, VERTICAL_PADDING_RATIO } from '@app/constants/signConstants';

export interface SignaturePreview {
  dataUrl: string;
  width: number;
  height: number;
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

export const buildSignaturePreview = async (config: SignParameters | null): Promise<SignaturePreview | null> => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  if (!config) {
    return null;
  }

  if (config.signatureType === 'text') {
    const text = config.signerName?.trim();
    if (!text) {
      return null;
    }

    const fontSize = config.fontSize ?? 16;
    const fontFamily = config.fontFamily ?? 'Helvetica';
    const textColor = config.textColor ?? '#000000';

    const paddingX = Math.round(fontSize * HORIZONTAL_PADDING_RATIO);
    const paddingY = Math.round(fontSize * VERTICAL_PADDING_RATIO);

    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');

    if (!measureCtx) {
      return null;
    }

    measureCtx.font = `${fontSize}px ${fontFamily}`;
    const metrics = measureCtx.measureText(text);
    const textWidth = Math.ceil(metrics.width);

    const width = Math.max(1, textWidth + paddingX * 2);
    const height = Math.max(1, Math.ceil(fontSize + paddingY * 2));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    ctx.fillStyle = textColor;
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(text, paddingX, height / 2);

    const dataUrl = canvas.toDataURL('image/png');
    return { dataUrl, width, height };
  }

  const dataUrl = config.signatureData;
  if (!dataUrl) {
    return null;
  }

  const image = await loadImage(dataUrl);
  return {
    dataUrl,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
};
