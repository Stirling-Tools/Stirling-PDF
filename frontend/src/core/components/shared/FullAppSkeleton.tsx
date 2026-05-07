import { Box, Stack } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import SkeletonLoader from "@app/components/shared/SkeletonLoader";

/**
 * A full-page skeleton that mimics the AppLayout + HomePage structure.
 * Used as a top-level loading fallback to provide immediate visual structure.
 */
export function FullAppSkeleton() {
  const isMobile = useMediaQuery("(max-width: 48em)");

  if (isMobile) {
    return (
      <div
        style={{
          height: "100dvh",
          width: "100vw",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          backgroundColor: "var(--mantine-color-body)",
        }}
      >
        {/* Mobile Header */}
        <Box
          h="3.5rem"
          style={{
            borderBottom: "1px solid var(--border-subtle)",
            backgroundColor: "var(--bg-toolbar)",
            display: "flex",
            alignItems: "center",
            padding: "0 1rem",
          }}
        >
          <Box
            w={120}
            h={24}
            style={{ borderRadius: 4, backgroundColor: "rgba(0,0,0,0.05)" }}
          />
        </Box>

        {/* Mobile View Switcher Placeholder */}
        <Box
          h="3rem"
          style={{
            borderBottom: "1px solid var(--border-subtle)",
            backgroundColor: "var(--bg-toolbar)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <Box
            w={80}
            h={30}
            style={{ borderRadius: 20, backgroundColor: "rgba(0,0,0,0.05)" }}
          />
          <Box
            w={80}
            h={30}
            style={{ borderRadius: 20, backgroundColor: "rgba(0,0,0,0.05)" }}
          />
        </Box>

        {/* Content Area */}
        <Box flex={1} h={0}>
          <SkeletonLoader type="toolList" count={8} />
        </Box>

        {/* Mobile Bottom Bar */}
        <Box
          h="4.5rem"
          style={{
            borderTop: "1px solid var(--border-subtle)",
            backgroundColor: "var(--bg-toolbar)",
            display: "flex",
            justifyContent: "space-around",
            alignItems: "center",
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <Stack key={i} align="center" gap={4}>
              <Box
                w={24}
                h={24}
                style={{ borderRadius: 4, backgroundColor: "rgba(0,0,0,0.05)" }}
              />
              <Box
                w={32}
                h={10}
                style={{ borderRadius: 2, backgroundColor: "rgba(0,0,0,0.05)" }}
              />
            </Stack>
          ))}
        </Box>
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100dvh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backgroundColor: "var(--mantine-color-body)",
      }}
    >
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Left Side: QuickAccessBar Skeleton */}
        <Box
          w="4.5rem"
          h="100%"
          style={{
            borderRight: "1px solid var(--border-subtle)",
            backgroundColor: "var(--bg-toolbar, #f8f9fa)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: "1rem",
            flexShrink: 0,
          }}
        >
          <Stack gap="lg">
            {Array.from({ length: 5 }).map((_, i) => (
              <Box
                key={i}
                w={32}
                h={32}
                style={{
                  borderRadius: "8px",
                  backgroundColor: "rgba(0,0,0,0.05)",
                }}
              />
            ))}
          </Stack>
        </Box>

        {/* Middle Left: ToolPanel Skeleton */}
        <Box
          w="18.5rem"
          h="100%"
          style={{
            borderRight: "1px solid var(--border-subtle)",
            backgroundColor: "var(--bg-toolbar, #f8f9fa)",
            flexShrink: 0,
          }}
        >
          <SkeletonLoader type="toolList" count={10} />
        </Box>

        {/* Main Content: Workbench Skeleton */}
        <Box
          flex={1}
          h="100%"
          p="md"
          style={{ backgroundColor: "var(--bg-app, #fff)" }}
        >
          <SkeletonLoader type="viewer" />
        </Box>

        {/* Right Side: RightRail Placeholder */}
        <Box
          w="3.5rem"
          h="100%"
          style={{
            borderLeft: "1px solid var(--border-subtle)",
            backgroundColor: "var(--bg-toolbar, #f8f9fa)",
            flexShrink: 0,
          }}
        />
      </div>
    </div>
  );
}
