import './index.css';
import React, { useState } from 'react';
import HomePage from './pages/HomePage';
import { SidecarTest } from './components/SidecarTest';

export default function App() {
  const [showTests, setShowTests] = useState(false); // Start with app visible
  
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex justify-between items-center">
          <h1 className="text-xl font-bold">Stirling PDF - Tauri Integration</h1>
          <button
            onClick={() => setShowTests(!showTests)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {showTests ? 'Show App' : 'Show Tests'}
          </button>
        </div>
      </div>
      
      {showTests ? <SidecarTest /> : <HomePage />}
    </div>
  );
}
