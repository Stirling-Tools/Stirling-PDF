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
 * Longest edge of the returned image. react-easy-crop reports the crop in natural pixels, so an
 * uncapped canvas turns a phone photo into a multi-MB lossless PNG that the upload gates reject.
 */
const MAX_OUTPUT_EDGE = 512;

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
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Downscale to MAX_OUTPUT_EDGE; also keeps the canvas under Safari's ~16.7M pixel ceiling,
        // past which toBlob returns null.
        const scale = Math.min(
          1,
          MAX_OUTPUT_EDGE / Math.max(pixelCrop.width, pixelCrop.height),
        );
        canvas.width = Math.max(1, Math.round(pixelCrop.width * scale));
        canvas.height = Math.max(1, Math.round(pixelCrop.height * scale));
        ctx.imageSmoothingQuality = "high";

        // drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)
        ctx.drawImage(
          image,
          pixelCrop.x,
          pixelCrop.y,
          pixelCrop.width,
          pixelCrop.height,
          0,
          0,
          canvas.width,
          canvas.height,
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
