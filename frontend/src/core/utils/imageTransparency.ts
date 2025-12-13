export interface TransparencyOptions {
  lowerBound?: { r: number; g: number; b: number };
  upperBound?: { r: number; g: number; b: number };
  autoDetectCorner?: boolean;
  tolerance?: number;
}

const DEFAULT_LOWER_BOUND = { r: 200, g: 200, b: 200 };
const DEFAULT_UPPER_BOUND = { r: 255, g: 255, b: 255 }; // #FFFFFF

export async function removeWhiteBackground(
  imageFile: File | string,
  options: TransparencyOptions = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      try {
        const result = processImageTransparency(img, options);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    if (typeof imageFile === 'string') {
      img.src = imageFile;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = () => {
        reject(new Error('Failed to read image file'));
      };
      reader.readAsDataURL(imageFile);
    }
  });
}

function processImageTransparency(
  img: HTMLImageElement,
  options: TransparencyOptions
): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  canvas.width = img.width;
  canvas.height = img.height;

  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  let lowerBound = options.lowerBound || DEFAULT_LOWER_BOUND;
  let upperBound = options.upperBound || DEFAULT_UPPER_BOUND;

  if (options.autoDetectCorner) {
    const cornerColor = detectCornerColor(imageData);
    const tolerance = options.tolerance || 10;
    lowerBound = {
      r: Math.max(0, cornerColor.r - tolerance),
      g: Math.max(0, cornerColor.g - tolerance),
      b: Math.max(0, cornerColor.b - tolerance)
    };
    upperBound = {
      r: Math.min(255, cornerColor.r + tolerance),
      g: Math.min(255, cornerColor.g + tolerance),
      b: Math.min(255, cornerColor.b + tolerance)
    };
  }

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (
      r >= lowerBound.r && r <= upperBound.r &&
      g >= lowerBound.g && g <= upperBound.g &&
      b >= lowerBound.b && b <= upperBound.b
    ) {
      data[i + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL('image/png');
}


function detectCornerColor(imageData: ImageData): { r: number; g: number; b: number } {
  const { width, height, data } = imageData;

  const sampleSize = 5;
  const corners = [
    { x: 0, y: 0 }, // top-left
    { x: width - sampleSize, y: 0 }, // top-right
    { x: 0, y: height - sampleSize }, // bottom-left
    { x: width - sampleSize, y: height - sampleSize } // bottom-right
  ];

  let totalR = 0, totalG = 0, totalB = 0;
  let samples = 0;

  corners.forEach(corner => {
    for (let dy = 0; dy < sampleSize; dy++) {
      for (let dx = 0; dx < sampleSize; dx++) {
        const x = Math.min(width - 1, Math.max(0, corner.x + dx));
        const y = Math.min(height - 1, Math.max(0, corner.y + dy));
        const i = (y * width + x) * 4;

        totalR += data[i];
        totalG += data[i + 1];
        totalB += data[i + 2];
        samples++;
      }
    }
  });

  return {
    r: Math.round(totalR / samples),
    g: Math.round(totalG / samples),
    b: Math.round(totalB / samples)
  };
}
