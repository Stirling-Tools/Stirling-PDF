import { AdjustContrastParameters } from '@app/hooks/tools/adjustContrast/useAdjustContrastParameters';

export function applyAdjustmentsToCanvas(src: HTMLCanvasElement, params: AdjustContrastParameters): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext('2d');
  if (!ctx) return src;
  ctx.drawImage(src, 0, 0);

  const imageData = ctx.getImageData(0, 0, out.width, out.height);
  const data = imageData.data;

  const contrast = params.contrast / 100; // 0..2
  const brightness = params.brightness / 100; // 0..2
  const saturation = params.saturation / 100; // 0..2
  const redMul = params.red / 100; // 0..2
  const greenMul = params.green / 100; // 0..2
  const blueMul = params.blue / 100; // 0..2

  const clamp = (v: number) => Math.min(255, Math.max(0, v));

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] * redMul;
    let g = data[i + 1] * greenMul;
    let b = data[i + 2] * blueMul;

    // Contrast (centered at 128)
    r = clamp((r - 128) * contrast + 128);
    g = clamp((g - 128) * contrast + 128);
    b = clamp((b - 128) * contrast + 128);

    // Brightness
    r = clamp(r * brightness);
    g = clamp(g * brightness);
    b = clamp(b * brightness);

    // Saturation via HSL
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn); const min = Math.min(rn, gn, bn);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
        case gn: h = (bn - rn) / d + 2; break;
        default: h = (rn - gn) / d + 4; break;
      }
      h /= 6;
    }
    s = Math.min(1, Math.max(0, s * saturation));
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    let r2: number, g2: number, b2: number;
    if (s === 0) { r2 = g2 = b2 = l; }
    else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r2 = hue2rgb(p, q, h + 1/3);
      g2 = hue2rgb(p, q, h);
      b2 = hue2rgb(p, q, h - 1/3);
    }
    data[i] = clamp(Math.round(r2 * 255));
    data[i + 1] = clamp(Math.round(g2 * 255));
    data[i + 2] = clamp(Math.round(b2 * 255));
  }

  ctx.putImageData(imageData, 0, 0);
  return out;
}


