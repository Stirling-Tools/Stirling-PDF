import React, { useRef, useEffect, useState, ReactNode } from 'react';

interface LazyLoadContainerProps {
  children: ReactNode;
  fallback?: ReactNode;
  rootMargin?: string;
  threshold?: number;
  className?: string;
  style?: React.CSSProperties;
  onLoad?: () => void;
  onUnload?: () => void;
}

/**
 * A reusable lazy loading container that only renders children when they come into view.
 * Uses Intersection Observer API for efficient viewport detection.
 * 
 * @param children - Content to render when visible
 * @param fallback - Content to show while loading (optional)
 * @param rootMargin - Margin around root for intersection detection (default: "50px")
 * @param threshold - Intersection ratio threshold (default: 0.1)
 * @param className - CSS class name
 * @param style - Inline styles
 * @param onLoad - Callback when content becomes visible
 * @param onUnload - Callback when content becomes hidden
 */
export const LazyLoadContainer: React.FC<LazyLoadContainerProps> = ({
  children,
  fallback = null,
  rootMargin = "50px",
  threshold = 0.1,
  className,
  style,
  onLoad,
  onUnload,
}) => {
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const visible = entry.isIntersecting;
        
        if (visible && !hasBeenVisible) {
          setHasBeenVisible(true);
          onLoad?.();
        } else if (!visible && hasBeenVisible) {
          onUnload?.();
        }
      },
      {
        rootMargin,
        threshold,
      }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [rootMargin, threshold, hasBeenVisible, onLoad, onUnload]);

  return (
    <div ref={containerRef} className={className} style={style}>
      {hasBeenVisible ? children : fallback}
    </div>
  );
};

export default LazyLoadContainer;
