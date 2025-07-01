import './index.css';
import React, { useEffect } from 'react';
import HomePage from './pages/HomePage';
import { BackendHealthIndicator } from './components/BackendHealthIndicator';

export default function App() {
  useEffect(() => {
    // Only start backend if running in Tauri
    const initializeBackend = async () => {
      try {
        // Check if we're running in Tauri environment
        if (typeof window !== 'undefined' && window.__TAURI__) {
          const { tauriBackendService } = await import('./services/tauriBackendService');
          console.log('Running in Tauri - Starting backend on React app startup...');
          await tauriBackendService.startBackend();
          console.log('Backend started successfully');
        } 
      } catch (error) {
        console.error('Failed to start backend on app startup:', error);
      }
    };

    initializeBackend();
  }, []);
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow-sm border-b relative">
        <BackendHealthIndicator className="absolute top-3 left-3 z-10" />
        <div className="max-w-4xl mx-auto px-4 py-3">
         <h1 className="text-xl font-bold">Stirling PDF</h1>
        </div>
      </div>
      
      <HomePage />
    </div>
  );
}
