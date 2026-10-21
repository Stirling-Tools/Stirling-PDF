import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import styles from "@app/components/runLocation/RunLocation.module.css";

/**
 * Eases its height to fit whatever it holds. CSS cannot transition to `auto`,
 * so the content is measured and the measured height applied. Clipping is only
 * on mid-transition: left on, it would cut off focus rings at the edges.
 */
export function AnimatedHeight({ children }: { children: ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  const [animating, setAnimating] = useState(false);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      const next = content.offsetHeight;
      setHeight((previous) => {
        if (previous !== undefined && previous !== next) setAnimating(true);
        return next;
      });
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={[styles.animatedHeight, animating ? styles.animating : ""]
        .filter(Boolean)
        .join(" ")}
      style={{ height }}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget) setAnimating(false);
      }}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
}
