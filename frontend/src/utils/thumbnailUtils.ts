import { getDocument } from "pdfjs-dist";

interface ColorScheme {
  bgTop: string;
  bgBottom: string;
  border: string;
  icon: string;
  badge: string;
  textPrimary: string;
  textSecondary: string;
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
 * Generate encrypted PDF thumbnail with lock icon
 */
function generateEncryptedPDFThumbnail(file: File): string {
  const canvas = document.createElement('canvas');
  canvas.width = 120;
  canvas.height = 150;
  const ctx = canvas.getContext('2d')!;

  // Use PDF color scheme but with encrypted styling
  const colorScheme = getFileTypeColorScheme('PDF');

  // Create gradient background
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, colorScheme.bgTop);
  gradient.addColorStop(1, colorScheme.bgBottom);

  // Rounded rectangle background
  drawRoundedRect(ctx, 8, 8, canvas.width - 16, canvas.height - 16, 8);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Border with dashed pattern for encrypted indicator
  ctx.strokeStyle = colorScheme.border;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]); // Reset dash pattern

  // Large lock icon as main element
  drawLargeLockIcon(ctx, canvas.width / 2, canvas.height / 2 - 10, colorScheme);

  // "PDF" text under the lock
  ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = colorScheme.icon;
  ctx.textAlign = 'center';
  ctx.fillText('PDF', canvas.width / 2, canvas.height / 2 + 35);

  // File size with subtle styling
  const sizeText = formatFileSize(file.size);
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = colorScheme.textSecondary;
  ctx.textAlign = 'center';
  ctx.fillText(sizeText, canvas.width / 2, canvas.height - 15);

  return canvas.toDataURL();
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
function getFileTypeColorScheme(extension: string): ColorScheme {
  const schemes: Record<string, ColorScheme> = {
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
 * Draw large lock icon for encrypted PDFs
 */
function drawLargeLockIcon(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, colorScheme: ColorScheme) {
  const size = 48;
  ctx.fillStyle = colorScheme.icon;
  ctx.strokeStyle = colorScheme.icon;
  ctx.lineWidth = 3;

  // Lock body (rectangle)
  const bodyWidth = size;
  const bodyHeight = size * 0.75;
  const bodyX = centerX - bodyWidth / 2;
  const bodyY = centerY - bodyHeight / 4;

  drawRoundedRect(ctx, bodyX, bodyY, bodyWidth, bodyHeight, 4);
  ctx.fill();

  // Lock shackle (semicircle)
  const shackleRadius = size * 0.32;
  const shackleY = centerY - size * 0.25;

  ctx.beginPath();
  ctx.arc(centerX, shackleY, shackleRadius, Math.PI, 2 * Math.PI);
  ctx.stroke();

  // Keyhole
  const keyholeX = centerX;
  const keyholeY = bodyY + bodyHeight * 0.4;
  ctx.fillStyle = colorScheme.textPrimary;
  ctx.beginPath();
  ctx.arc(keyholeX, keyholeY, 4, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillRect(keyholeX - 2, keyholeY, 4, 8);
}

/**
 * Draw extension badge
 */
function drawExtensionBadge(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, extension: string, colorScheme: ColorScheme) {
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
  // Skip thumbnail generation for very large files to avoid memory issues
  if (file.size >= 100 * 1024 * 1024) { // 100MB limit
    console.log('Skipping thumbnail generation for large file:', file.name);
    return generatePlaceholderThumbnail(file);
  }

  // Handle image files - use original file directly
  if (file.type.startsWith('image/')) {
    return URL.createObjectURL(file);
  }

  // Handle PDF files
  if (!file.type.startsWith('application/pdf')) {
    console.log('File is not a PDF or image, generating placeholder:', file.name);
    return generatePlaceholderThumbnail(file);
  }

  // Calculate quality scale based on file size
  console.log('Generating thumbnail for', file.name);
  const scale = calculateScaleFromFileSize(file.size);
  console.log(`Using scale ${scale} for ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
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

    // Check if PDF is encrypted
    if ((pdf as any).isEncrypted) {
      console.log('PDF is encrypted, generating encrypted thumbnail:', file.name);
      pdf.destroy();
      return generateEncryptedPDFThumbnail(file);
    }

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
      // Check if error indicates encrypted PDF
      const errorMessage = error.message.toLowerCase();
      if (errorMessage.includes('password') || errorMessage.includes('encrypted')) {
        console.log('PDF appears to be encrypted based on error, generating encrypted thumbnail:', file.name);
        return generateEncryptedPDFThumbnail(file);
      }

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

          // Check if PDF is encrypted in fallback too
          if ((pdf as any).isEncrypted) {
            console.log('PDF is encrypted in fallback, generating encrypted thumbnail:', file.name);
            pdf.destroy();
            return generateEncryptedPDFThumbnail(file);
          }

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
