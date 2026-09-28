import { useEffect, useRef, useState, type ReactNode } from "react";
import { Box } from "@mantine/core";

interface LazyToolSectionProps {
  /** Rendered height reserved until the real content mounts, so the scrollbar stays put. */
  estimatedHeight: number;
  children: ReactNode;
}

/**
 * Mounts its children once the section comes near the picker's viewport.
 * The picker renders every category eagerly otherwise, which is most of the
 * DOM on a page that may only show a couple of categories at a time.
 */
export function LazyToolSection({
  estimatedHeight,
  children,
}: LazyToolSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (mounted) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setMounted(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [mounted]);

  return (
    <Box
      ref={ref}
      w="100%"
      style={mounted ? undefined : { minHeight: estimatedHeight }}
    >
      {mounted ? children : null}
    </Box>
  );
}
