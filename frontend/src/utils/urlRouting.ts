/**
 * URL routing utilities for tool navigation
 * Provides clean URL routing for the V2 tool system
 */

import { ModeType, isValidMode as isValidModeType, getDefaultMode, ToolRoute } from '../types/navigation';

/**
 * Parse the current URL to extract tool routing information
 */
export function parseToolRoute(): ToolRoute {
  const path = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);

  // Extract tool from URL path (e.g., /split-pdf -> split)
  const toolMatch = path.match(/\/([a-zA-Z-]+)(?:-pdf)?$/);
  if (toolMatch) {
    const toolKey = toolMatch[1].toLowerCase();

    // Map URL paths to tool keys and modes (excluding internal UI modes)
    const toolMappings: Record<string, { mode: ModeType; toolKey: string }> = {
      'split-pdfs': { mode: 'split', toolKey: 'split' },
      'split': { mode: 'split', toolKey: 'split' },
      'merge-pdfs': { mode: 'merge', toolKey: 'merge' },
      'compress-pdf': { mode: 'compress', toolKey: 'compress' },
      'convert': { mode: 'convert', toolKey: 'convert' },
      'convert-pdf': { mode: 'convert', toolKey: 'convert' },
      'file-to-pdf': { mode: 'convert', toolKey: 'convert' },
      'eml-to-pdf': { mode: 'convert', toolKey: 'convert' },
      'html-to-pdf': { mode: 'convert', toolKey: 'convert' },
      'markdown-to-pdf': { mode: 'convert', toolKey: 'convert' },
      'pdf-to-csv': { mode: 'convert', toolKey: 'convert' },
      'pdf-to-img': { mode: 'convert', toolKey: 'convert' },
      'pdf-to-markdown': { mode: 'convert', toolKey: 'convert' },
      'pdf-to-pdfa': { mode: 'convert', toolKey: 'convert' },
      'pdf-to-word': { mode: 'convert', toolKey: 'convert' },
      'pdf-to-xml': { mode: 'convert', toolKey: 'convert' },
      'add-password': { mode: 'addPassword', toolKey: 'addPassword' },
      'change-permissions': { mode: 'changePermissions', toolKey: 'changePermissions' },
      'sanitize-pdf': { mode: 'sanitize', toolKey: 'sanitize' },
      'ocr': { mode: 'ocr', toolKey: 'ocr' },
      'ocr-pdf': { mode: 'ocr', toolKey: 'ocr' },
      'add-watermark': { mode: 'addWatermark', toolKey: 'addWatermark' },
      'remove-password': { mode: 'removePassword', toolKey: 'removePassword' },
      'single-large-page': { mode: 'single-large-page', toolKey: 'single-large-page' },
      'repair': { mode: 'repair', toolKey: 'repair' },
      'unlock-pdf-forms': { mode: 'unlockPdfForms', toolKey: 'unlockPdfForms' },
      'remove-certificate-sign': { mode: 'removeCertificateSign', toolKey: 'removeCertificateSign' },
      'remove-cert-sign': { mode: 'removeCertificateSign', toolKey: 'removeCertificateSign' }
    };

    const mapping = toolMappings[toolKey];
    if (mapping) {
      return {
        mode: mapping.mode,
        toolKey: mapping.toolKey
      };
    }
  }

  // Check for query parameter fallback (e.g., ?tool=split)
  const toolParam = searchParams.get('tool');
  if (toolParam && isValidModeType(toolParam)) {
    return {
      mode: toolParam as ModeType,
      toolKey: toolParam
    };
  }

  // Default to page editor for home page
  return {
    mode: getDefaultMode(),
    toolKey: null
  };
}

/**
 * Update the URL to reflect the current tool selection
 * Internal UI modes (viewer, fileEditor, pageEditor) don't get URLs
 */
export function updateToolRoute(mode: ModeType, toolKey?: string): void {
  const currentPath = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);

  // Don't create URLs for internal UI modes
  if (mode === 'viewer' || mode === 'fileEditor' || mode === 'pageEditor') {
    // If we're switching to an internal mode, clear any existing tool URL
    if (currentPath !== '/') {
      clearToolRoute();
    }
    return;
  }

  let newPath = '/';

  // Map modes to URL paths (only for actual tools)
  if (toolKey) {
    const pathMappings: Record<string, string> = {
      'split': '/split-pdfs',
      'merge': '/merge-pdf',
      'compress': '/compress-pdf',
      'convert': '/convert-pdf',
      'addPassword': '/add-password-pdf',
      'changePermissions': '/change-permissions-pdf',
      'sanitize': '/sanitize-pdf',
      'ocr': '/ocr-pdf',
      'addWatermark': '/watermark',
      'removePassword': '/remove-password',
      'single-large-page': '/single-large-page',
      'repair': '/repair',
      'unlockPdfForms': '/unlock-pdf-forms',
      'removeCertificateSign': '/remove-certificate-sign'
    };

    newPath = pathMappings[toolKey] || `/${toolKey}`;
  }

  // Remove tool query parameter since we're using path-based routing
  searchParams.delete('tool');

  // Construct final URL
  const queryString = searchParams.toString();
  const fullUrl = newPath + (queryString ? `?${queryString}` : '');

  // Update URL without triggering page reload
  if (currentPath !== newPath || window.location.search !== (queryString ? `?${queryString}` : '')) {
    window.history.replaceState(null, '', fullUrl);
  }
}

/**
 * Clear tool routing and return to home page
 */
export function clearToolRoute(): void {
  const searchParams = new URLSearchParams(window.location.search);
  searchParams.delete('tool');

  const queryString = searchParams.toString();
  const url = '/' + (queryString ? `?${queryString}` : '');

  window.history.replaceState(null, '', url);
}

/**
 * Get clean tool name for display purposes
 */
export function getToolDisplayName(toolKey: string): string {
  const displayNames: Record<string, string> = {
    'split': 'Split PDF',
    'merge': 'Merge PDF',
    'compress': 'Compress PDF',
    'convert': 'Convert PDF',
    'addPassword': 'Add Password',
    'changePermissions': 'Change Permissions',
    'sanitize': 'Sanitize PDF',
    'ocr': 'OCR PDF'
  };

  return displayNames[toolKey] || toolKey;
}

// Note: isValidMode is now imported from types/navigation.ts

/**
 * Generate shareable URL for current tool state
 * Only generates URLs for actual tools, not internal UI modes
 */
export function generateShareableUrl(mode: ModeType, toolKey?: string): string {
  const baseUrl = window.location.origin;

  // Don't generate URLs for internal UI modes
  if (mode === 'viewer' || mode === 'fileEditor' || mode === 'pageEditor') {
    return baseUrl;
  }

  if (toolKey) {
    const pathMappings: Record<string, string> = {
      'split': '/split-pdf',
      'merge': '/merge-pdf',
      'compress': '/compress-pdf',
      'convert': '/convert-pdf',
      'addPassword': '/add-password-pdf',
      'changePermissions': '/change-permissions-pdf',
      'sanitize': '/sanitize-pdf',
      'ocr': '/ocr-pdf',
      'addWatermark': '/watermark',
      'removePassword': '/remove-password',
      'single-large-page': '/single-large-page',
      'repair': '/repair',
      'unlockPdfForms': '/unlock-pdf-forms',
      'removeCertificateSign': '/remove-certificate-sign'
    };

    const path = pathMappings[toolKey] || `/${toolKey}`;
    return `${baseUrl}${path}`;
  }

  return baseUrl;
}
