import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface DiagnosticResult {
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
  details?: string;
}

export const SidecarTest: React.FC = () => {
  const [logs, setLogs] = useState<DiagnosticResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [autoStart, setAutoStart] = useState(true);

  const addLog = (level: DiagnosticResult['level'], message: string, details?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, level, message, details }]);
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, details || '');
  };

  const clearLogs = () => setLogs([]);

  const runDiagnostics = async () => {
    setIsRunning(true);
    clearLogs();
    
    addLog('info', 'Starting comprehensive sidecar diagnostics...');
    
    try {
      // Step 1: Environment Check
      addLog('info', 'Checking environment...');
      
      // Check Java first
      try {
        const javaResult = await invoke('check_java_environment') as string;
        addLog('info', 'Java Environment Check:', javaResult);
        if (javaResult.includes('not found') || javaResult.includes('failed')) {
          addLog('error', 'Java is not available', 'Please install Java 17+ and ensure it is in your PATH');
          setIsRunning(false);
          return;
        }
      } catch (error) {
        addLog('error', 'Failed to check Java environment', String(error));
        setIsRunning(false);
        return;
      }
      
      try {
        const jarResult = await invoke('check_jar_exists') as string;
        addLog('info', 'JAR Check Result:', jarResult);
        if (!jarResult.includes('Found JAR files')) {
          addLog('error', 'No JAR files found - build required!', 'You need to build the Java backend first');
          addLog('info', 'To fix this, run one of these commands:');
          addLog('info', '• Linux/Mac: ./build-tauri.sh');
          addLog('info', '• Windows: build-tauri.bat');
          addLog('info', '• Or manually: ./gradlew bootJar && cd frontend && npx tauri dev');
          addLog('info', 'The JAR should be created in build/libs/ directory');
          setIsRunning(false);
          return;
        }
      } catch (error) {
        addLog('error', 'Failed to check JAR files', String(error));
        setIsRunning(false);
        return;
      }

      try {
        const binaryResult = await invoke('test_sidecar_binary') as string;
        addLog('info', 'Binary Check Result:', binaryResult);
        if (!binaryResult.includes('Binary exists')) {
          addLog('error', 'Sidecar binary not found', binaryResult);
          setIsRunning(false);
          return;
        }
      } catch (error) {
        addLog('error', 'Failed to check sidecar binary', String(error));
        setIsRunning(false);
        return;
      }

      // Step 2: Start Backend
      addLog('info', 'Attempting to start backend sidecar...');
      try {
        const startResult = await invoke('start_backend') as string;
        addLog('info', 'Backend start command result:', startResult);
        
        // Wait a moment for process to initialize
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check if process is actually running
        const statusResult = await invoke('get_backend_status') as string;
        addLog('info', 'Backend process status:', statusResult);
        
        if (statusResult.includes('not running')) {
          addLog('error', 'Backend process failed to start or crashed immediately');
          addLog('info', 'This could be due to:');
          addLog('info', '- Java not installed or not in PATH');
          addLog('info', '- Port 8080 already in use');
          addLog('info', '- JAR file corruption');
          addLog('info', '- Missing dependencies');
        }
        
      } catch (error) {
        addLog('error', 'Failed to start backend', String(error));
      }

      // Step 3: Port Testing
      addLog('info', 'Testing port connectivity...');
      let attempts = 0;
      const maxAttempts = 15;
      let connected = false;

      while (attempts < maxAttempts && !connected) {
        attempts++;
        addLog('info', `Port test attempt ${attempts}/${maxAttempts}...`);
        
        try {
          const portResult = await invoke('check_backend_port') as boolean;
          if (portResult) {
            addLog('success', 'Port 8080 is responding!');
            connected = true;
            break;
          }
        } catch (error) {
          addLog('warning', `Port check via Rust failed: ${error}`);
        }

        // Fallback: direct fetch
        try {
          const response = await fetch('http://localhost:8080/', { 
            method: 'HEAD',
            signal: AbortSignal.timeout(3000)
          });
          addLog('success', `Direct HTTP test successful: ${response.status}`);
          connected = true;
          break;
        } catch (fetchError) {
          addLog('warning', `HTTP test failed: ${fetchError}`);
        }

        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 4000));
        }
      }

      if (!connected) {
        addLog('error', 'Backend is not responding on port 8080 after 60 seconds');
        addLog('info', 'Possible solutions:');
        addLog('info', '1. Check if Java is installed: java --version');
        addLog('info', '2. Check if port 8080 is free: netstat -an | grep 8080');
        addLog('info', '3. Try running the JAR manually from terminal');
        addLog('info', '4. Check firewall settings');
      } else {
        // Step 4: Get detailed sidecar logs
        addLog('info', 'Fetching detailed sidecar logs...');
        try {
          const sidecarLogs = await invoke('get_backend_logs') as string[];
          if (sidecarLogs.length > 0) {
            addLog('info', 'Sidecar execution logs:');
            sidecarLogs.forEach(log => {
              addLog('info', log);
            });
          } else {
            addLog('warning', 'No sidecar logs available - this suggests the sidecar never started');
          }
        } catch (error) {
          addLog('error', 'Failed to get sidecar logs', String(error));
        }

        // Step 5: API Testing
        addLog('info', 'Testing API endpoints...');
        
        const endpoints = [
          { path: '/', description: 'Home page' },
          { path: '/actuator/health', description: 'Health endpoint' },
          { path: '/actuator/info', description: 'Info endpoint' }
        ];

        for (const endpoint of endpoints) {
          try {
            const response = await fetch(`http://localhost:8080${endpoint.path}`);
            if (response.ok) {
              const contentType = response.headers.get('content-type');
              let preview = '';
              if (contentType?.includes('application/json')) {
                const data = await response.json();
                preview = JSON.stringify(data).substring(0, 100) + '...';
              } else {
                const text = await response.text();
                preview = text.substring(0, 100) + '...';
              }
              addLog('success', `${endpoint.description} working`, `Status: ${response.status}, Preview: ${preview}`);
            } else {
              addLog('warning', `${endpoint.description} returned ${response.status}`);
            }
          } catch (error) {
            addLog('error', `${endpoint.description} failed`, String(error));
          }
        }
      }

    } catch (error) {
      addLog('error', 'Diagnostic process failed', String(error));
    } finally {
      setIsRunning(false);
    }
  };

  // Auto-run diagnostics on mount
  useEffect(() => {
    if (autoStart) {
      const timer = setTimeout(() => {
        runDiagnostics();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [autoStart]);

  const getLogColor = (level: DiagnosticResult['level']) => {
    switch (level) {
      case 'info': return 'text-blue-700 bg-blue-50 border-blue-200';
      case 'warning': return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'error': return 'text-red-700 bg-red-50 border-red-200';
      case 'success': return 'text-green-700 bg-green-50 border-green-200';
    }
  };

  const getLogIcon = (level: DiagnosticResult['level']) => {
    switch (level) {
      case 'info': return 'ℹ️';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      case 'success': return '✅';
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold mb-6 text-center">Backend Sidecar Diagnostics</h1>
        
        <div className="mb-6 flex gap-4 justify-center">
          <button
            onClick={runDiagnostics}
            disabled={isRunning}
            className={`px-6 py-3 rounded-lg font-medium ${
              isRunning
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isRunning ? 'Running Diagnostics...' : 'Run Diagnostics'}
          </button>
          
          <button
            onClick={clearLogs}
            disabled={isRunning}
            className="px-6 py-3 rounded-lg font-medium bg-gray-600 hover:bg-gray-700 text-white disabled:bg-gray-400"
          >
            Clear Logs
          </button>
          
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Auto-start diagnostics</span>
          </label>
        </div>

        <div className="bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-gray-400 text-center py-8">
              No diagnostic logs yet. Click "Run Diagnostics" to start.
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log, index) => (
                <div key={index} className={`p-3 rounded border ${getLogColor(log.level)}`}>
                  <div className="flex items-start gap-2">
                    <span className="text-lg">{getLogIcon(log.level)}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-500">{log.timestamp}</span>
                        <span className="font-medium">{log.message}</span>
                      </div>
                      {log.details && (
                        <div className="mt-1 text-sm font-mono bg-gray-100 p-2 rounded">
                          {log.details}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {logs.length > 0 && (
          <div className="mt-4 text-sm text-gray-600">
            Total logs: {logs.length} | 
            Errors: {logs.filter(l => l.level === 'error').length} | 
            Warnings: {logs.filter(l => l.level === 'warning').length} | 
            Success: {logs.filter(l => l.level === 'success').length}
          </div>
        )}
      </div>
    </div>
  );
};