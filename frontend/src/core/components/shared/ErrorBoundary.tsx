import React from 'react';
import { Text, Button, Stack } from '@mantine/core';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{error?: Error; retry: () => void}>;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Enhanced logging for diagnosis
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('🔴 ErrorBoundary caught an error');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Component stack:', errorInfo.componentStack);
    console.error('Current URL:', window.location.href);
    console.error('Current pathname:', window.location.pathname);
    console.error('Current hash:', window.location.hash);
    console.error('Current search:', window.location.search);
    console.error('Timestamp:', new Date().toISOString());
    console.error('User agent:', navigator.userAgent);
    // Check for React error codes
    if (error.message.includes('Minified React error')) {
      const errorCodeMatch = error.message.match(/#(\d+)/);
      if (errorCodeMatch) {
        const errorCode = errorCodeMatch[1];
        console.error(`React Error #${errorCode}: https://react.dev/errors/${errorCode}`);
      }
    }

    // Check localStorage for auth state
    try {
      const jwt = localStorage.getItem('stirling_jwt');
      console.error('Auth state:', {
        hasJWT: !!jwt,
        jwtLength: jwt?.length || 0,
      });
    } catch (e) {
      console.error('Could not check localStorage:', e);
    }

    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  retry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const Fallback = this.props.fallback;
        return <Fallback error={this.state.error} retry={this.retry} />;
      }

      return (
        <Stack align="center" justify="center" style={{ minHeight: '200px', padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
          <Text size="lg" fw={500} c="red">Something went wrong</Text>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <>
              <Text size="sm" c="dimmed" style={{ textAlign: 'center', fontFamily: 'monospace', marginTop: '1rem' }}>
                {this.state.error.message}
              </Text>
              {this.state.error.stack && (
                <details style={{ marginTop: '1rem', width: '100%' }}>
                  <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>
                    <Text size="sm" component="span">Show stack trace</Text>
                  </summary>
                  <pre style={{
                    fontSize: '0.75rem',
                    overflow: 'auto',
                    backgroundColor: '#f5f5f5',
                    padding: '1rem',
                    borderRadius: '4px',
                    maxHeight: '300px'
                  }}>
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </>
          )}
          <Button onClick={this.retry} variant="light" mt="md">
            Try Again
          </Button>
        </Stack>
      );
    }

    return this.props.children;
  }
}
