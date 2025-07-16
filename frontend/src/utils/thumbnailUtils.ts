import { getDocument } from "pdfjs-dist";

/**
 * Calculate thumbnail scale based on file size
 * Smaller files get higher quality, larger files get lower quality
 */
export function calculateScaleFromFileSize(fileSize: number): number {
  const MB = 1024 * 1024;
  
  if (fileSize < 1 * MB) return 0.6;      // < 1MB: High quality
  if (fileSize < 5 * MB) return 0.4;      // 1-5MB: Medium-high quality  
  if (fileSize < 15 * MB) return 0.3;     // 5-15MB: Medium quality
  if (fileSize < 30 * MB) return 0.2;     // 15-30MB: Low-medium quality
  return 0.15;                            // 30MB+: Low quality
}

/**
 * Generate thumbnail for a PDF file during upload
 * Returns base64 data URL or undefined if generation fails
 */
export async function generateThumbnailForFile(file: File): Promise<string | undefined> {
  // Skip thumbnail generation for large files to avoid memory issues
  if (file.size >= 50 * 1024 * 1024) { // 50MB limit
    console.log('Skipping thumbnail generation for large file:', file.name);
    return undefined;
  }
  
  try {
    console.log('Generating thumbnail for', file.name);
    
    // Calculate quality scale based on file size
    const scale = calculateScaleFromFileSize(file.size);
    console.log(`Using scale ${scale} for ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
    
    // Only read first 2MB for thumbnail generation to save memory
    const chunkSize = 2 * 1024 * 1024; // 2MB
    const chunk = file.slice(0, Math.min(chunkSize, file.size));
    const arrayBuffer = await chunk.arrayBuffer();
    
    const pdf = await getDocument({ 
      data: arrayBuffer,
      disableAutoFetch: true,
      disableStream: true
    }).promise;
    
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale }); // Dynamic scale based on file size
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");
    
    if (!context) {
      throw new Error('Could not get canvas context');
    }
    
    await page.render({ canvasContext: context, viewport }).promise;
    const thumbnail = canvas.toDataURL();
    
    // Immediately clean up memory after thumbnail generation
    pdf.destroy();
    console.log('Thumbnail generated and PDF destroyed for', file.name);
    
    return thumbnail;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'InvalidPDFException') {
        console.warn(`PDF structure issue for ${file.name} - using fallback thumbnail`);
        // Return a placeholder or try with full file instead of chunk
        try {
          const fullArrayBuffer = await file.arrayBuffer();
          const pdf = await getDocument({ 
            data: fullArrayBuffer,
            disableAutoFetch: true,
            disableStream: true,
            verbosity: 0 // Reduce PDF.js warnings
          }).promise;
          
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext("2d");
          
          if (!context) {
            throw new Error('Could not get canvas context');
          }
          
          await page.render({ canvasContext: context, viewport }).promise;
          const thumbnail = canvas.toDataURL();
          
          pdf.destroy();
          return thumbnail;
        } catch (fallbackError) {
          console.warn('Fallback thumbnail generation also failed for', file.name, fallbackError);
          return undefined;
        }
      } else {
        console.warn('Failed to generate thumbnail for', file.name, error);
        return undefined;
      }
    }
    console.warn('Unknown error generating thumbnail for', file.name, error);
    return undefined;
  }
}