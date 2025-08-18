import { getDocument } from "pdfjs-dist";

export interface ThumbnailWithMetadata {
  thumbnail: string | undefined;
  pageCount: number;
}

/**
 * Calculate thumbnail scale based on file size
 */
export function calculateScaleFromFileSize(fileSize: number): number {
  const MB = 1024 * 1024;
  if (fileSize < 1 * MB) return 0.6;
  if (fileSize < 5 * MB) return 0.4;
  if (fileSize < 15 * MB) return 0.3;
  if (fileSize < 30 * MB) return 0.2;
  return 0.15;
}

/**
 * Get file type color scheme
 */
function getFileTypeColor(extension: string): { bg: string; text: string; icon: string } {
  const ext = extension.toLowerCase();
  
  const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
    pdf: { bg: '#ff4444', text: '#ffffff', icon: '📄' },
    doc: { bg: '#2196f3', text: '#ffffff', icon: '📝' },
    docx: { bg: '#2196f3', text: '#ffffff', icon: '📝' },
    xls: { bg: '#4caf50', text: '#ffffff', icon: '📊' },
    xlsx: { bg: '#4caf50', text: '#ffffff', icon: '📊' },
    ppt: { bg: '#ff9800', text: '#ffffff', icon: '📈' },
    pptx: { bg: '#ff9800', text: '#ffffff', icon: '📈' },
    txt: { bg: '#607d8b', text: '#ffffff', icon: '📃' },
    rtf: { bg: '#795548', text: '#ffffff', icon: '📃' },
    odt: { bg: '#3f51b5', text: '#ffffff', icon: '📝' },
    ods: { bg: '#009688', text: '#ffffff', icon: '📊' },
    odp: { bg: '#e91e63', text: '#ffffff', icon: '📈' }
  };

  return colorMap[ext] || { bg: '#9e9e9e', text: '#ffffff', icon: '📄' };
}

/**
 * Generate simple placeholder thumbnail
 */
function generatePlaceholderThumbnail(file: File): string {
  const canvas = document.createElement('canvas');
  canvas.width = 120;
  canvas.height = 150;
  const ctx = canvas.getContext('2d')!;
  
  const extension = file.name.split('.').pop() || 'file';
  const colors = getFileTypeColor(extension);
  
  // Colored background
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // File icon
  ctx.font = '48px Arial';
  ctx.textAlign = 'center';
  ctx.fillStyle = colors.text;
  ctx.fillText(colors.icon, canvas.width / 2, canvas.height / 2);
  
  // File extension
  ctx.font = '12px Arial';
  ctx.fillStyle = colors.text;
  ctx.fillText(extension.toUpperCase(), canvas.width / 2, canvas.height - 20);
  
  return canvas.toDataURL();
}

/**
 * Generate PDF thumbnail from first page
 */
async function generatePdfThumbnail(file: File, scale: number): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  
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
}

/**
 * Generate thumbnail for any file type
 */
export async function generateThumbnailForFile(file: File): Promise<string | undefined> {
  // Skip very large files
  if (file.size >= 100 * 1024 * 1024) {
    return generatePlaceholderThumbnail(file);
  }

  // Handle image files
  if (file.type.startsWith('image/')) {
    return URL.createObjectURL(file);
  }

  // Handle PDF files
  if (file.type.startsWith('application/pdf')) {
    const scale = calculateScaleFromFileSize(file.size);
    try {
      return await generatePdfThumbnail(file, scale);
    } catch (error) {
      return generatePlaceholderThumbnail(file);
    }
  }

  // All other files get placeholder
  return generatePlaceholderThumbnail(file);
}

/**
 * Generate thumbnail and extract page count for a PDF file
 */
export async function generateThumbnailWithMetadata(file: File): Promise<ThumbnailWithMetadata> {
  // Non-PDF files default to 1 page
  if (!file.type.startsWith('application/pdf')) {
    const thumbnail = await generateThumbnailForFile(file);
    return { thumbnail, pageCount: 1 };
  }

  // Skip very large files
  if (file.size >= 100 * 1024 * 1024) {
    const thumbnail = generatePlaceholderThumbnail(file);
    return { thumbnail, pageCount: 1 };
  }

  const scale = calculateScaleFromFileSize(file.size);
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocument({ data: arrayBuffer }).promise;
    
    const pageCount = pdf.numPages;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");

    if (!context) {
      pdf.destroy();
      throw new Error('Could not get canvas context');
    }

    await page.render({ canvasContext: context, viewport }).promise;
    const thumbnail = canvas.toDataURL();
    
    pdf.destroy();
    return { thumbnail, pageCount };

  } catch (error) {
    const thumbnail = generatePlaceholderThumbnail(file);
    return { thumbnail, pageCount: 1 };
  }
}