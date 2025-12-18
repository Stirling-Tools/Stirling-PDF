import React from 'react';
import { Box, Group, Stack } from '@mantine/core';

interface SkeletonLoaderProps {
  type: 'pageGrid' | 'fileGrid' | 'controls' | 'viewer' | 'block';
  count?: number;
  animated?: boolean;
  width?: number | string;
  height?: number | string;
  radius?: number | string;
}

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  type,
  count = 8,
  animated = true,
  width,
  height,
  radius = 8,
}) => {
  const animationStyle = animated ? { animation: 'pulse 2s infinite' } : {};

  // Generic block skeleton for inline text/inputs/etc.
  const renderBlock = () => (
    <Box
      w={typeof width === 'number' ? `${width}px` : width}
      h={typeof height === 'number' ? `${height}px` : height}
      bg="gray.1"
      style={{
        borderRadius: radius,
        display: 'inline-block',
        verticalAlign: 'middle',
        ...animationStyle
      }}
    />
  );

  const renderPageGridSkeleton = () => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
      gap: '1rem'
    }}>
      {Array.from({ length: count }).map((_, i) => (
        <Box
          key={i}
          w="100%"
          h={240}
          bg="gray.1"
          style={{
            borderRadius: '8px',
            ...animationStyle,
            animationDelay: animated ? `${i * 0.1}s` : undefined
          }}
        />
      ))}
    </div>
  );

  const renderFileGridSkeleton = () => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
      gap: '1rem'
    }}>
      {Array.from({ length: count }).map((_, i) => (
        <Box
          key={i}
          w="100%"
          h={280}
          bg="gray.1"
          style={{
            borderRadius: '8px',
            ...animationStyle,
            animationDelay: animated ? `${i * 0.1}s` : undefined
          }}
        />
      ))}
    </div>
  );

  const renderControlsSkeleton = () => (
    <Group mb="md">
      <Box w={150} h={36} bg="gray.1" style={{ borderRadius: 4, ...animationStyle }} />
      <Box w={120} h={36} bg="gray.1" style={{ borderRadius: 4, ...animationStyle }} />
      <Box w={100} h={36} bg="gray.1" style={{ borderRadius: 4, ...animationStyle }} />
    </Group>
  );

  const renderViewerSkeleton = () => (
    <Stack gap="md" h="100%">
      {/* Toolbar skeleton */}
      <Group>
        <Box w={40} h={40} bg="gray.1" style={{ borderRadius: 4, ...animationStyle }} />
        <Box w={40} h={40} bg="gray.1" style={{ borderRadius: 4, ...animationStyle }} />
        <Box w={80} h={40} bg="gray.1" style={{ borderRadius: 4, ...animationStyle }} />
        <Box w={40} h={40} bg="gray.1" style={{ borderRadius: 4, ...animationStyle }} />
      </Group>
      {/* Main content skeleton */}
      <Box
        flex={1}
        bg="gray.1"
        style={{
          borderRadius: '8px',
          ...animationStyle
        }}
      />
    </Stack>
  );

  switch (type) {
    case 'block':
      return renderBlock();
    case 'pageGrid':
      return renderPageGridSkeleton();
    case 'fileGrid':
      return renderFileGridSkeleton();
    case 'controls':
      return renderControlsSkeleton();
    case 'viewer':
      return renderViewerSkeleton();
    default:
      return null;
  }
};

export default SkeletonLoader;
