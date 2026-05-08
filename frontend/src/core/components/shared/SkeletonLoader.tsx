import React from "react";
import { Skeleton, Stack, Group } from "@mantine/core";

interface SkeletonLoaderProps {
  type: "pageGrid" | "fileGrid" | "controls" | "viewer" | "block" | "toolList";
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
  // Generic block skeleton for inline text/inputs/etc.
  const renderBlock = () => (
    <Skeleton
      visible
      animate={animated}
      width={width}
      height={height}
      radius={radius}
    />
  );

  const renderToolListSkeleton = () => (
    <Stack gap="xs" p="sm" h="100%" w="100%">
      {/* Search bar placeholder */}
      <Skeleton visible animate={animated} height={40} radius={8} mb="xs" />

      {/* List items */}
      {Array.from({ length: count }).map((_, i) => (
        <Group key={i} wrap="nowrap" gap="sm" py={4}>
          <Skeleton
            visible
            animate={animated}
            width={32}
            height={32}
            radius={6}
          />
          <Skeleton
            visible
            animate={animated}
            height={20}
            radius={4}
            style={{ flex: 1 }}
          />
        </Group>
      ))}
    </Stack>
  );

  const renderPageGridSkeleton = () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: "1rem",
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} visible animate={animated} height={240} radius={8} />
      ))}
    </div>
  );

  const renderFileGridSkeleton = () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: "1rem",
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} visible animate={animated} height={280} radius={8} />
      ))}
    </div>
  );

  const renderControlsSkeleton = () => (
    <Group mb="md">
      <Skeleton visible animate={animated} width={150} height={36} radius={4} />
      <Skeleton visible animate={animated} width={120} height={36} radius={4} />
      <Skeleton visible animate={animated} width={100} height={36} radius={4} />
    </Group>
  );

  const renderViewerSkeleton = () => (
    <Stack gap="md" h="100%">
      {/* Toolbar skeleton */}
      <Group>
        <Skeleton
          visible
          animate={animated}
          width={40}
          height={40}
          radius={4}
        />
        <Skeleton
          visible
          animate={animated}
          width={40}
          height={40}
          radius={4}
        />
        <Skeleton
          visible
          animate={animated}
          width={80}
          height={40}
          radius={4}
        />
        <Skeleton
          visible
          animate={animated}
          width={40}
          height={40}
          radius={4}
        />
      </Group>
      {/* Main content skeleton */}
      <Skeleton visible animate={animated} radius={8} style={{ flex: 1 }} />
    </Stack>
  );

  switch (type) {
    case "block":
      return renderBlock();
    case "toolList":
      return renderToolListSkeleton();
    case "pageGrid":
      return renderPageGridSkeleton();
    case "fileGrid":
      return renderFileGridSkeleton();
    case "controls":
      return renderControlsSkeleton();
    case "viewer":
      return renderViewerSkeleton();
    default:
      return null;
  }
};

export default SkeletonLoader;
