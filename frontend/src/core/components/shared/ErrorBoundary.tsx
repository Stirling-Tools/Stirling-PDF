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
    console.error('ErrorBoundary caught an error:', error, errorInfo);
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
        <Stack align="center" justify="center" style={{ minHeight: '200px', padding: '2rem' }}>
          <Text size="lg" fw={500} c="red">Something went wrong</Text>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <Text size="sm" c="dimmed" style={{ textAlign: 'center', fontFamily: 'monospace' }}>
              {this.state.error.message}
            </Text>
          )}
          <Button onClick={this.retry} variant="light">
            Try Again
          </Button>
        </Stack>
      );
    }

    return this.props.children;
  }
}