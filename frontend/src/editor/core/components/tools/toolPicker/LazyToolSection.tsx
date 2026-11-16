import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Box } from "@mantine/core";

interface LazyToolSectionProps {
  /** Rendered height reserved until the real content mounts, so the scrollbar stays put. */
  estimatedHeight: number;
  children: ReactNode;
  /**
   * The picker's scroll container. Its clip bounds the observer, so a viewport
   * root would ignore the prefetch margin and mount sections only on sight.
   */
  scrollRoot?: RefObject<HTMLElement | null>;
  /** Named on the keyboard placeholder so the revealed section has context. */
  label?: string;
}

/**
 * Mounts its children once the section comes near the picker viewport.
 * The picker renders every category eagerly otherwise, which is most of the
 * DOM on a page that may only show a couple of categories at a time. The
 * placeholder is focusable so sequential Tab still reaches every section.
 */
export function LazyToolSection({
  estimatedHeight,
  children,
  scrollRoot,
  label,
}: LazyToolSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const focusOnMountRef = useRef(false);

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
      { root: scrollRoot?.current ?? null, rootMargin: "300px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [mounted, scrollRoot]);

  useEffect(() => {
    if (!mounted || !focusOnMountRef.current) return;
    focusOnMountRef.current = false;
    ref.current?.querySelector<HTMLElement>("a, button, [tabindex]")?.focus();
  }, [mounted]);

  return (
    <Box
      ref={ref}
      w="100%"
      style={mounted ? undefined : { minHeight: estimatedHeight }}
    >
      {mounted ? (
        children
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label={label}
          onClick={() => setMounted(true)}
          onFocus={() => {
            focusOnMountRef.current = true;
            setMounted(true);
          }}
        />
      )}
    </Box>
  );
}
