import React from 'react';
import '../index.css';
import { useBackendHealth } from '../hooks/useBackendHealth';

interface BackendHealthIndicatorProps {
  className?: string;
}

export const BackendHealthIndicator: React.FC<BackendHealthIndicatorProps> = ({ 
  className = ''
}) => {
  const { isHealthy, isChecking, error, checkHealth } = useBackendHealth();

  let statusColor = 'bg-red-500'; // offline
  if (isChecking || (!isHealthy && error === 'Backend starting up...')) {
    statusColor = 'bg-yellow-500'; // starting/checking
  } else if (isHealthy) {
    statusColor = 'bg-green-500'; // online
  }

  return (
    <div 
      className={`w-2xs h-2xs ${statusColor} rounded-full cursor-pointer ${isChecking ? 'animate-pulse' : ''} ${className}`}
      onClick={checkHealth}
      title={isHealthy ? 'Backend Online' : isChecking ? 'Checking...' : 'Backend Offline'}
    />
  );
};