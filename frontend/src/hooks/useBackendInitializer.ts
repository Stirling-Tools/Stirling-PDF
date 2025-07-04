import { useEffect } from 'react';

/**
 * Custom hook to handle backend initialization in Tauri environment
 * Automatically starts the backend when the app loads if running in Tauri
 */
export function useBackendInitializer() {
  useEffect(() => {
    // Only start backend if running in Tauri
    const initializeBackend = async () => {
      try {
        // Check if we're running in Tauri environment
        if (typeof window !== 'undefined' && (window.__TAURI__ || window.__TAURI_INTERNALS__)) {
          const { tauriBackendService } = await import('../services/tauriBackendService');
          console.log('Running in Tauri - Starting backend on React app startup...');
          await tauriBackendService.startBackend();
          console.log('Backend started successfully');
        }
        else {
          console.warn('Not running in Tauri - Backend will not be started');
        } 
      } catch (error) {
        console.error('Failed to start backend on app startup:', error);
      }
    };

    initializeBackend();
  }, []);
}