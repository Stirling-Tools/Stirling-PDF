/**
 * Crops an image based on the provided pixel crop area using HTML5 Canvas API.
 * Returns a PNG blob ready for upload.
 */

export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Creates a cropped image blob from the source image and crop area.
 *
 * @param imageSrc - Data URL or blob URL of the source image
 * @param pixelCrop - Pixel coordinates and dimensions of the crop area
 * @returns Promise that resolves to a PNG Blob of the cropped image
 */
export async function getCroppedImage(
  imageSrc: string,
  pixelCrop: Area,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      try {
        // Create canvas with crop dimensions
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Set canvas size to crop dimensions
        canvas.width = pixelCrop.width;
        canvas.height = pixelCrop.height;

        // Draw the cropped region
        // drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)
        // sx, sy: source x, y coordinates
        // sw, sh: source width, height
        // dx, dy: destination x, y coordinates (0, 0 for top-left)
        // dw, dh: destination width, height
        ctx.drawImage(
          image,
          pixelCrop.x,
          pixelCrop.y,
          pixelCrop.width,
          pixelCrop.height,
          0,
          0,
          pixelCrop.width,
          pixelCrop.height,
        );

        // Convert canvas to PNG blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to create blob from canvas"));
              return;
            }
            resolve(blob);
          },
          "image/png",
          1.0, // Maximum quality
        );
      } catch (error) {
        reject(error);
      }
    };

    image.onerror = () => {
      reject(new Error("Failed to load image"));
    };

    // Start loading the image
    image.src = imageSrc;
  });
}
