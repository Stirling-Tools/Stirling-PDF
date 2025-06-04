import { getDocument } from "pdfjs-dist";

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
    const viewport = page.getViewport({ scale: 0.2 }); // Smaller scale for memory efficiency
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
    console.warn('Failed to generate thumbnail for', file.name, error);
    return undefined;
  }
}