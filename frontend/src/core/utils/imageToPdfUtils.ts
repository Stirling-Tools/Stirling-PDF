import { PDFDocument, PageSizes } from 'pdf-lib';

export interface ImageToPdfOptions {
  imageResolution?: 'full' | 'reduced';
  pageFormat?: 'keep' | 'A4' | 'letter';
  stretchToFit?: boolean;
}

/**
 * Convert an image file to a PDF file
 * @param imageFile - The image file to convert (JPEG, PNG, etc.)
 * @param options - Conversion options
 * @returns A Promise that resolves to a PDF File object
 */
export async function convertImageToPdf(
  imageFile: File,
  options: ImageToPdfOptions = {}
): Promise<File> {
  const {
    imageResolution = 'full',
    pageFormat = 'A4',
    stretchToFit = false,
  } = options;
  try {
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();

    // Read the image file as an array buffer
    let imageBytes = await imageFile.arrayBuffer();

    // Apply image resolution reduction if requested
    if (imageResolution === 'reduced') {
      const reducedImage = await reduceImageResolution(imageFile, 1200); // Max 1200px on longest side
      imageBytes = await reducedImage.arrayBuffer();
    }

    // Embed the image based on its type
    let image;
    const imageType = imageFile.type.toLowerCase();

    if (imageType === 'image/jpeg' || imageType === 'image/jpg') {
      image = await pdfDoc.embedJpg(imageBytes);
    } else if (imageType === 'image/png') {
      image = await pdfDoc.embedPng(imageBytes);
    } else {
      // For other image types, try to convert to PNG first using canvas
      const convertedImage = await convertImageToPng(imageFile);
      const convertedBytes = await convertedImage.arrayBuffer();
      image = await pdfDoc.embedPng(convertedBytes);
    }

    // Get image dimensions
    const { width: imageWidth, height: imageHeight } = image;

    // Determine page dimensions based on pageFormat option
    let pageWidth: number;
    let pageHeight: number;

    if (pageFormat === 'keep') {
      // Use original image dimensions
      pageWidth = imageWidth;
      pageHeight = imageHeight;
    } else if (pageFormat === 'letter') {
      // US Letter: 8.5" x 11" = 612 x 792 points
      pageWidth = PageSizes.Letter[0];
      pageHeight = PageSizes.Letter[1];
    } else {
      // A4: 210mm x 297mm = 595 x 842 points (default)
      pageWidth = PageSizes.A4[0];
      pageHeight = PageSizes.A4[1];
    }

    // Adjust page orientation based on image orientation if using standard page size
    if (pageFormat !== 'keep') {
      const imageIsLandscape = imageWidth > imageHeight;
      const pageIsLandscape = pageWidth > pageHeight;

      // Rotate page to match image orientation
      if (imageIsLandscape !== pageIsLandscape) {
        [pageWidth, pageHeight] = [pageHeight, pageWidth];
      }
    }

    // Create a page
    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Calculate image placement based on stretchToFit option
    let drawX: number;
    let drawY: number;
    let drawWidth: number;
    let drawHeight: number;

    if (stretchToFit || pageFormat === 'keep') {
      // Stretch/fill to page
      drawX = 0;
      drawY = 0;
      drawWidth = pageWidth;
      drawHeight = pageHeight;
    } else {
      // Fit within page bounds while preserving aspect ratio
      const imageAspectRatio = imageWidth / imageHeight;
      const pageAspectRatio = pageWidth / pageHeight;

      if (imageAspectRatio > pageAspectRatio) {
        // Image is wider than page - fit to width
        drawWidth = pageWidth;
        drawHeight = pageWidth / imageAspectRatio;
        drawX = 0;
        drawY = (pageHeight - drawHeight) / 2; // Center vertically
      } else {
        // Image is taller than page - fit to height
        drawHeight = pageHeight;
        drawWidth = pageHeight * imageAspectRatio;
        drawY = 0;
        drawX = (pageWidth - drawWidth) / 2; // Center horizontally
      }
    }

    // Draw the image on the page
    page.drawImage(image, {
      x: drawX,
      y: drawY,
      width: drawWidth,
      height: drawHeight,
    });

    // Save the PDF to bytes
    const pdfBytes = await pdfDoc.save();

    // Create a filename by replacing the image extension with .pdf
    const pdfFilename = imageFile.name.replace(/\.[^.]+$/, '.pdf');

    // Create a File object from the PDF bytes
    const pdfFile = new File([pdfBytes], pdfFilename, {
      type: 'application/pdf',
    });

    return pdfFile;
  } catch (error) {
    console.error('Error converting image to PDF:', error);
    throw new Error(
      `Failed to convert image to PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Convert an image file to PNG using canvas
 * This is used for image types that pdf-lib doesn't directly support
 */
async function convertImageToPng(imageFile: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageFile);

    img.onload = () => {
      try {
        // Create a canvas with the image dimensions
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        // Draw the image on the canvas
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }
        ctx.drawImage(img, 0, 0);

        // Convert canvas to blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to convert canvas to blob'));
              return;
            }

            // Create a File object from the blob
            const pngFilename = imageFile.name.replace(/\.[^.]+$/, '.png');
            const pngFile = new File([blob], pngFilename, {
              type: 'image/png',
            });

            URL.revokeObjectURL(url);
            resolve(pngFile);
          },
          'image/png',
          1.0
        );
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Reduce image resolution to a maximum dimension
 * @param imageFile - The image file to reduce
 * @param maxDimension - Maximum width or height in pixels
 * @returns A Promise that resolves to a reduced resolution image file
 */
async function reduceImageResolution(
  imageFile: File,
  maxDimension: number
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageFile);

    img.onload = () => {
      try {
        const { width, height } = img;

        // Check if reduction is needed
        if (width <= maxDimension && height <= maxDimension) {
          URL.revokeObjectURL(url);
          resolve(imageFile); // No reduction needed
          return;
        }

        // Calculate new dimensions while preserving aspect ratio
        let newWidth: number;
        let newHeight: number;

        if (width > height) {
          newWidth = maxDimension;
          newHeight = (height / width) * maxDimension;
        } else {
          newHeight = maxDimension;
          newWidth = (width / height) * maxDimension;
        }

        // Create a canvas with the new dimensions
        const canvas = document.createElement('canvas');
        canvas.width = newWidth;
        canvas.height = newHeight;

        // Draw the resized image on the canvas
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }
        ctx.drawImage(img, 0, 0, newWidth, newHeight);

        // Convert canvas to blob (preserve original format if possible)
        const outputType = imageFile.type.startsWith('image/')
          ? imageFile.type
          : 'image/jpeg';

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to convert canvas to blob'));
              return;
            }

            // Create a File object from the blob
            const reducedFile = new File([blob], imageFile.name, {
              type: outputType,
            });

            URL.revokeObjectURL(url);
            resolve(reducedFile);
          },
          outputType,
          0.9 // Quality (only applies to JPEG)
        );
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Check if a file is an image
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}
