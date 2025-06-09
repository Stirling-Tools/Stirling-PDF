import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { backendService } from '../services/backendService';

interface BackendStatusProps {}

export const BackendStatus: React.FC<BackendStatusProps> = () => {
  const [status, setStatus] = useState<'starting' | 'healthy' | 'error' | 'unknown'>('unknown');
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  useEffect(() => {
    runDiagnostics();
  }, []);

  const runDiagnostics = async () => {
    const info: string[] = [];
    
    try {
      // Check if JAR exists
      const jarCheck = await invoke('check_jar_exists') as string;
      info.push(`JAR Check: ${jarCheck}`);
      
      // Check if sidecar binary exists
      const binaryCheck = await invoke('test_sidecar_binary') as string;
      info.push(`Binary Check: ${binaryCheck}`);
      
      setDebugInfo(info);
    } catch (err) {
      info.push(`Diagnostic Error: ${err}`);
      setDebugInfo(info);
    }
  };

  const initializeBackend = async () => {
    try {
      setStatus('starting');
      setError(null);
      
      await backendService.startBackend();
      setStatus('healthy');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  };

  const checkHealth = async () => {
    const isHealthy = await backendService.checkHealth();
    setStatus(isHealthy ? 'healthy' : 'error');
  };

  const getStatusColor = () => {
    switch (status) {
      case 'healthy': return 'text-green-600';
      case 'starting': return 'text-yellow-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'healthy': return 'Backend Running';
      case 'starting': return 'Starting Backend...';
      case 'error': return 'Backend Error';
      default: return 'Backend Status Unknown';
    }
  };

  return (
    <div className="p-4 border rounded-lg">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Backend Status</h3>
        <button
          onClick={checkHealth}
          className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Refresh
        </button>
      </div>
      
      <div className={`mt-2 font-medium ${getStatusColor()}`}>
        {getStatusText()}
      </div>
      
      {error && (
        <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
          Error: {error}
        </div>
      )}
      
      {status === 'healthy' && (
        <div className="mt-2 text-sm text-gray-600">
          Backend URL: {backendService.getBackendUrl()}
        </div>
      )}
      
      {status === 'error' && (
        <button
          onClick={initializeBackend}
          className="mt-2 px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
        >
          Retry Start
        </button>
      )}
      
      <div className="mt-4">
        <h4 className="text-sm font-medium text-gray-700">Debug Information:</h4>
        <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded max-h-32 overflow-y-auto">
          {debugInfo.map((info, index) => (
            <div key={index}>{info}</div>
          ))}
        </div>
        <button
          onClick={runDiagnostics}
          className="mt-2 px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          Refresh Diagnostics
        </button>
      </div>
    </div>
  );
};