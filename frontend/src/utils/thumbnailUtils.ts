import { getDocument } from "pdfjs-dist";

export interface ThumbnailWithMetadata {
  thumbnail: string | undefined;
  pageCount: number;
}

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
 * Generate modern placeholder thumbnail with file extension
 */
function generatePlaceholderThumbnail(file: File): string {
  const canvas = document.createElement('canvas');
  canvas.width = 120;
  canvas.height = 150;
  const ctx = canvas.getContext('2d')!;
  
  // Get file extension for color theming
  const extension = file.name.split('.').pop()?.toUpperCase() || 'FILE';
  const colorScheme = getFileTypeColorScheme(extension);
  
  // Create gradient background
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, colorScheme.bgTop);
  gradient.addColorStop(1, colorScheme.bgBottom);
  
  // Rounded rectangle background
  drawRoundedRect(ctx, 8, 8, canvas.width - 16, canvas.height - 16, 8);
  ctx.fillStyle = gradient;
  ctx.fill();
  
  // Subtle shadow/border
  ctx.strokeStyle = colorScheme.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  
  // Modern document icon
  drawModernDocumentIcon(ctx, canvas.width / 2, 45, colorScheme.icon);
  
  // Extension badge
  drawExtensionBadge(ctx, canvas.width / 2, canvas.height / 2 + 15, extension, colorScheme);
  
  // File size with subtle styling
  const sizeText = formatFileSize(file.size);
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = colorScheme.textSecondary;
  ctx.textAlign = 'center';
  ctx.fillText(sizeText, canvas.width / 2, canvas.height - 15);
  
  return canvas.toDataURL();
}

/**
 * Get color scheme based on file extension
 */
function getFileTypeColorScheme(extension: string) {
  const schemes: Record<string, any> = {
    // Documents
    'PDF': { bgTop: '#FF6B6B20', bgBottom: '#FF6B6B10', border: '#FF6B6B40', icon: '#FF6B6B', badge: '#FF6B6B', textPrimary: '#FFFFFF', textSecondary: '#666666' },
    'DOC': { bgTop: '#4ECDC420', bgBottom: '#4ECDC410', border: '#4ECDC440', icon: '#4ECDC4', badge: '#4ECDC4', textPrimary: '#FFFFFF', textSecondary: '#666666' },
    'DOCX': { bgTop: '#4ECDC420', bgBottom: '#4ECDC410', border: '#4ECDC440', icon: '#4ECDC4', badge: '#4ECDC4', textPrimary: '#FFFFFF', textSecondary: '#666666' },
    'TXT': { bgTop: '#95A5A620', bgBottom: '#95A5A610', border: '#95A5A640', icon: '#95A5A6', badge: '#95A5A6', textPrimary: '#FFFFFF', textSecondary: '#666666' },
    
    // Spreadsheets
    'XLS': { bgTop: '#2ECC7120', bgBottom: '#2ECC7110', border: '#2ECC7140', icon: '#2ECC71', badge: '#2ECC71', textPrimary: '#FFFFFF', textSecondary: '#666666' },
    'XLSX': { bgTop: '#2ECC7120', bgBottom: '#2ECC7110', border: '#2ECC7140', icon: '#2ECC71', badge: '#2ECC71', textPrimary: '#FFFFFF', textSecondary: '#666666' },
    'CSV': { bgTop: '#2ECC7120', bgBottom: '#2ECC7110', border: '#2ECC7140', icon: '#2ECC71', badge: '#2ECC71', textPrimary: '#FFFFFF', textSecondary: '#666666' },
    
    // Presentations
    'PPT': { bgTop: '#E67E2220', bgBottom: '#E67E2210', border: '#E67E2240', icon: '#E67E22', badge: '#E67E22', textPrimary: '#FFFFFF', textSecondary: '#666666' },
    'PPTX': { bgTop: '#E67E2220', bgBottom: '#E67E2210', border: '#E67E2240', icon: '#E67E22', badge: '#E67E22', textPrimary: '#FFFFFF', textSecondary: '#666666' },
    
    // Archives
    'ZIP': { bgTop: '#9B59B620', bgBottom: '#9B59B610', border: '#9B59B640', icon: '#9B59B6', badge: '#9B59B6', textPrimary: '#FFFFFF', textSecondary: '#666666' },
    'RAR': { bgTop: '#9B59B620', bgBottom: '#9B59B610', border: '#9B59B640', icon: '#9B59B6', badge: '#9B59B6', textPrimary: '#FFFFFF', textSecondary: '#666666' },
    '7Z': { bgTop: '#9B59B620', bgBottom: '#9B59B610', border: '#9B59B640', icon: '#9B59B6', badge: '#9B59B6', textPrimary: '#FFFFFF', textSecondary: '#666666' },
    
    // Default
    'DEFAULT': { bgTop: '#74B9FF20', bgBottom: '#74B9FF10', border: '#74B9FF40', icon: '#74B9FF', badge: '#74B9FF', textPrimary: '#FFFFFF', textSecondary: '#666666' }
  };
  
  return schemes[extension] || schemes['DEFAULT'];
}

/**
 * Draw rounded rectangle
 */
function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Draw modern document icon
 */
function drawModernDocumentIcon(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, color: string) {
  const size = 24;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  
  // Document body
  drawRoundedRect(ctx, centerX - size/2, centerY - size/2, size, size * 1.2, 3);
  ctx.fill();
  
  // Folded corner
  ctx.beginPath();
  ctx.moveTo(centerX + size/2 - 6, centerY - size/2);
  ctx.lineTo(centerX + size/2, centerY - size/2 + 6);
  ctx.lineTo(centerX + size/2 - 6, centerY - size/2 + 6);
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF40';
  ctx.fill();
}

/**
 * Draw extension badge
 */
function drawExtensionBadge(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, extension: string, colorScheme: any) {
  const badgeWidth = Math.max(extension.length * 8 + 16, 40);
  const badgeHeight = 22;
  
  // Badge background
  drawRoundedRect(ctx, centerX - badgeWidth/2, centerY - badgeHeight/2, badgeWidth, badgeHeight, 11);
  ctx.fillStyle = colorScheme.badge;
  ctx.fill();
  
  // Badge text
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = colorScheme.textPrimary;
  ctx.textAlign = 'center';
  ctx.fillText(extension, centerX, centerY + 4);
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}


/**
 * Generate thumbnail for any file type
 * Returns base64 data URL or undefined if generation fails
 */
export async function generateThumbnailForFile(file: File): Promise<string | undefined> {
  console.log(`🎯 generateThumbnailForFile: Starting for ${file.name} (${file.type}, ${file.size} bytes)`);
  
  // Skip thumbnail generation for very large files to avoid memory issues
  if (file.size >= 100 * 1024 * 1024) { // 100MB limit
    console.log('🎯 Skipping thumbnail generation for large file:', file.name);
    const placeholder = generatePlaceholderThumbnail(file);
    console.log('🎯 Generated placeholder thumbnail for large file:', file.name);
    return placeholder;
  }

  // Handle image files - use original file directly
  if (file.type.startsWith('image/')) {
    console.log('🎯 Creating blob URL for image file:', file.name);
    const url = URL.createObjectURL(file);
    console.log('🎯 Created image blob URL:', url);
    return url;
  }

  // Handle PDF files
  if (!file.type.startsWith('application/pdf')) {
    console.log('🎯 File is not a PDF or image, generating placeholder:', file.name);
    const placeholder = generatePlaceholderThumbnail(file);
    console.log('🎯 Generated placeholder thumbnail for non-PDF file:', file.name);
    return placeholder;
  }

  // Calculate quality scale based on file size
  console.log('🎯 Generating PDF thumbnail for', file.name);
  const scale = calculateScaleFromFileSize(file.size);
  console.log(`🎯 Using scale ${scale} for ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
  try {
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
    console.log('🎯 PDF thumbnail successfully generated for', file.name, 'size:', thumbnail.length);

    return thumbnail;
  } catch (error) {
    console.warn('🎯 Error generating PDF thumbnail for', file.name, ':', error);
    if (error instanceof Error) {
      if (error.name === 'InvalidPDFException') {
        console.warn(`🎯 PDF structure issue for ${file.name} - trying fallback with full file`);
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
          console.log('🎯 Fallback PDF thumbnail generation succeeded for', file.name);
          return thumbnail;
        } catch (fallbackError) {
          console.warn('🎯 Fallback thumbnail generation also failed for', file.name, fallbackError);
          console.log('🎯 Using placeholder thumbnail for', file.name);
          return generatePlaceholderThumbnail(file);
        }
      } else {
        console.warn('🎯 Non-PDF error generating thumbnail for', file.name, error);
        console.log('🎯 Using placeholder thumbnail for', file.name);
        return generatePlaceholderThumbnail(file);
      }
    }
    console.warn('🎯 Unknown error generating thumbnail for', file.name, error);
    console.log('🎯 Using placeholder thumbnail for', file.name);
    return generatePlaceholderThumbnail(file);
  }
}

/**
 * Generate thumbnail and extract page count for a PDF file
 * Returns both thumbnail and metadata in a single pass
 */
export async function generateThumbnailWithMetadata(file: File): Promise<ThumbnailWithMetadata> {
  console.log(`🎯 generateThumbnailWithMetadata: Starting for ${file.name} (${file.type}, ${file.size} bytes)`);
  
  // Non-PDF files default to 1 page
  if (!file.type.startsWith('application/pdf')) {
    console.log('🎯 File is not a PDF, generating placeholder with pageCount=1:', file.name);
    const thumbnail = await generateThumbnailForFile(file);
    return { thumbnail, pageCount: 1 };
  }

  // Skip thumbnail generation for very large files to avoid memory issues
  if (file.size >= 100 * 1024 * 1024) { // 100MB limit
    console.log('🎯 Skipping processing for large PDF file:', file.name);
    const thumbnail = generatePlaceholderThumbnail(file);
    return { thumbnail, pageCount: 1 }; // Default to 1 for large files
  }

  // Calculate quality scale based on file size
  const scale = calculateScaleFromFileSize(file.size);
  console.log(`🎯 Using scale ${scale} for ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);

  try {
    // Read file chunk for processing
    const chunkSize = 2 * 1024 * 1024; // 2MB
    const chunk = file.slice(0, Math.min(chunkSize, file.size));
    const arrayBuffer = await chunk.arrayBuffer();
    
    const pdf = await getDocument({
      data: arrayBuffer,
      disableAutoFetch: true,
      disableStream: true,
      verbosity: 0
    }).promise;

    const pageCount = pdf.numPages;
    console.log(`🎯 PDF ${file.name} has ${pageCount} pages`);

    // Generate thumbnail for first page
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

    // Clean up
    pdf.destroy();
    
    console.log('🎯 Successfully generated thumbnail with metadata for', file.name, `${pageCount} pages, thumbnail size:`, thumbnail.length);
    return { thumbnail, pageCount };

  } catch (error) {
    console.warn('🎯 Error generating PDF thumbnail with metadata for', file.name, ':', error);
    
    // Try fallback with full file if chunk approach failed
    if (error instanceof Error && error.name === 'InvalidPDFException') {
      try {
        console.warn(`🎯 Trying fallback with full file for ${file.name}`);
        const fullArrayBuffer = await file.arrayBuffer();
        const pdf = await getDocument({
          data: fullArrayBuffer,
          disableAutoFetch: true,
          disableStream: true,
          verbosity: 0
        }).promise;

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
        
        console.log('🎯 Fallback successful for', file.name, `${pageCount} pages`);
        return { thumbnail, pageCount };

      } catch (fallbackError) {
        console.warn('🎯 Fallback also failed for', file.name, fallbackError);
      }
    }

    // Final fallback: placeholder thumbnail with default page count
    console.log('🎯 Using placeholder thumbnail with default pageCount=1 for', file.name);
    const thumbnail = generatePlaceholderThumbnail(file);
    return { thumbnail, pageCount: 1 };
  }
}
