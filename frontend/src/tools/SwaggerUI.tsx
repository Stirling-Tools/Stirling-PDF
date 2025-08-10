import React, { useEffect } from 'react';
import { BaseToolProps } from '../types/tool';

const SwaggerUI: React.FC<BaseToolProps> = () => {
  useEffect(() => {
    // Redirect to Swagger UI
    window.open('/swagger-ui/5.21.0/index.html', '_blank');
  }, []);

  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <p>Opening Swagger UI in a new tab...</p>
      <p>If it didn't open automatically, <a href="/swagger-ui/5.21.0/index.html" target="_blank" rel="noopener noreferrer">click here</a></p>
    </div>
  );
};

export default SwaggerUI;