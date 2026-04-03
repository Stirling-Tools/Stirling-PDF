import { useEffect, useState, useCallback } from 'react';

export interface FontOption {
  value: string;
  label: string;
}

const DEFAULT_FONTS: FontOption[] = [
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Times-Roman', label: 'Times' },
  { value: 'Courier', label: 'Courier' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Georgia', label: 'Georgia' },
];

export interface UseSystemFontsResult {
  fontOptions: FontOption[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  fontCount: number;
}

/**
 * Detect if running in Tauri desktop mode
 * Checks for __TAURI__ in window (fully initialized Tauri)
 * Also checks if we should try backend URL as fallback
 */
function isTauriMode(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const hasTauri = '__TAURI__' in window;
    console.log('[useSystemFonts] Platform check: __TAURI__ exists?', hasTauri);
    return hasTauri;
  } catch (e) {
    console.error('[useSystemFonts] Error checking Tauri mode:', e);
    return false;
  }
}

/**
 * Get the API base URL - handles both web and Tauri desktop modes
 * In Tauri: Uses the backend service URL
 * In Web: Uses relative paths (proxied by Vite)
 * 
 * Fallback strategy:
 * 1. If __TAURI__ detected: try backend service
 * 2. If we detect localhost:8080 is available: use it
 * 3. Fall back to relative paths (web mode - Vite proxy)
 */
async function getApiBaseUrl(): Promise<string> {
  console.log('[useSystemFonts] getApiBaseUrl: Starting URL detection...');
  const tauriMode = isTauriMode();
  
  if (tauriMode) {
    try {
      console.log('[useSystemFonts] Tauri detected, importing backend service...');
      const { tauriBackendService } = await import('../../desktop/services/tauriBackendService');
      
      if (tauriBackendService) {
        const backendUrl = tauriBackendService.getBackendUrl();
        if (backendUrl) {
          console.log('[useSystemFonts] ✅ Using Tauri backend URL:', backendUrl);
          return backendUrl;
        }
      }
    } catch (e) {
      console.warn('[useSystemFonts] Failed to get Tauri backend URL:', e);
    }
  }
  
  // Fallback: If we're NOT in pure web dev (not at localhost:5173), try localhost:8080
  // This handles Tauri dev before __TAURI__ is fully initialized
  if (typeof window !== 'undefined') {
    const isViteWebDev = window.location.hostname === 'localhost' && window.location.port === '5173';
    const isNetworkAddress = !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1');
    
    if (!isViteWebDev) {
      console.log('[useSystemFonts] Not in Vite web dev mode, trying localhost:8080...');
      return 'http://localhost:8080';
    }
  }
  
  // Final fallback: web mode (relative paths, Vite will proxy)
  console.log('[useSystemFonts] Using web mode (relative paths)');
  return '';
}

/**
 * Hook to fetch system fonts from the backend API with caching and retry logic
 * Supports both web (with Vite proxy) and Tauri desktop modes
 */
export const useSystemFonts = (): UseSystemFontsResult => {
  const [fontOptions, setFontOptions] = useState<FontOption[]>(DEFAULT_FONTS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFonts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    console.log('[useSystemFonts] Starting font fetch...');

    try {
      const baseUrl = await getApiBaseUrl();
      
      // First, try to refresh the backend cache
      console.log('[useSystemFonts] Triggering backend font cache refresh...');
      try {
        const refreshUrl = `${baseUrl}/api/v1/general/fonts/refresh`;
        console.log('[useSystemFonts] Refresh URL:', refreshUrl);
        await fetch(refreshUrl, { method: 'POST' });
        console.log('[useSystemFonts] Backend cache refreshed');
      } catch (refreshErr) {
        console.warn('[useSystemFonts] Failed to refresh backend cache:', refreshErr);
      }

      const fontsUrl = `${baseUrl}/api/v1/general/fonts`;
      console.log('[useSystemFonts] Calling:', fontsUrl);
      const response = await fetch(fontsUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      console.log(`[useSystemFonts] API Response status: ${response.status}`);

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const fontNames: string[] = await response.json();
      console.log(`[useSystemFonts] Raw API response (${fontNames.length} fonts):`, fontNames);

      if (!Array.isArray(fontNames)) {
        throw new Error('API response is not an array');
      }

      if (fontNames.length === 0) {
        console.warn('[useSystemFonts] API returned empty font list, using defaults');
        setFontOptions(DEFAULT_FONTS);
        setError('No system fonts found, using defaults');
      } else {
        const converted = fontNames.map(f => {
          const trimmed = f.trim();
          return { value: trimmed, label: trimmed };
        });
        setFontOptions(converted);
        console.log(`[useSystemFonts] ✅ Successfully loaded ${converted.length} system fonts`);
        console.log('[useSystemFonts] First 10 fonts:', converted.slice(0, 10).map(f => f.label));
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[useSystemFonts] ❌ Failed to fetch fonts:', errorMsg);
      console.error('[useSystemFonts] Error details:', err);
      setError(errorMsg);
      setFontOptions(DEFAULT_FONTS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFonts();
  }, [fetchFonts]);

  return { fontOptions, isLoading, error, refetch: fetchFonts, fontCount: fontOptions.length };
};
