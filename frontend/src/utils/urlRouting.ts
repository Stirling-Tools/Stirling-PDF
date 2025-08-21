/**
 * URL routing utilities for tool navigation
 * Provides clean URL routing for the V2 tool system
 */

import { ModeType } from '../contexts/NavigationContext';

export interface ToolRoute {
  mode: ModeType;
  toolKey?: string;
}

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
      'split': { mode: 'split', toolKey: 'split' },
      'merge': { mode: 'merge', toolKey: 'merge' },
      'compress': { mode: 'compress', toolKey: 'compress' },
      'convert': { mode: 'convert', toolKey: 'convert' },
      'add-password': { mode: 'addPassword', toolKey: 'addPassword' },
      'change-permissions': { mode: 'changePermissions', toolKey: 'changePermissions' },
      'sanitize': { mode: 'sanitize', toolKey: 'sanitize' },
      'ocr': { mode: 'ocr', toolKey: 'ocr' }
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
  if (toolParam && isValidMode(toolParam)) {
    return {
      mode: toolParam as ModeType,
      toolKey: toolParam
    };
  }
  
  // Default to page editor for home page
  return {
    mode: 'pageEditor'
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
      'split': '/split-pdf',
      'merge': '/merge-pdf', 
      'compress': '/compress-pdf',
      'convert': '/convert-pdf',
      'addPassword': '/add-password-pdf',
      'changePermissions': '/change-permissions-pdf',
      'sanitize': '/sanitize-pdf',
      'ocr': '/ocr-pdf'
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

/**
 * Check if a mode is valid
 */
function isValidMode(mode: string): mode is ModeType {
  const validModes: ModeType[] = [
    'viewer', 'pageEditor', 'fileEditor', 'merge', 'split', 
    'compress', 'ocr', 'convert', 'addPassword', 'changePermissions', 'sanitize'
  ];
  return validModes.includes(mode as ModeType);
}

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
      'ocr': '/ocr-pdf'
    };
    
    const path = pathMappings[toolKey] || `/${toolKey}`;
    return `${baseUrl}${path}`;
  }
  
  return baseUrl;
}