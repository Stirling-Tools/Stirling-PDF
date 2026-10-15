import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import styles from "@app/components/shared/setupCard/SetupCard.module.css";

/** Resizes closer together than this are one continuous change. */
const FOLLOW_WINDOW_MS = 100;

/**
 * Eases its height to fit whatever it holds. CSS cannot transition to `auto`,
 * so the content is measured and the measured height applied. Clipping is only
 * on mid-transition: left on, it would cut off focus rings at the edges.
 * Content that resizes frame by frame (an animating child) is followed
 * directly; easing each of those steps too would trail behind it. Under
 * reduced motion there is no transition, so there is nothing to clip for.
 */
export function AnimatedHeight({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  const [animating, setAnimating] = useState(false);
  const [following, setFollowing] = useState(false);
  const lastHeight = useRef<number | undefined>(undefined);
  const lastResize = useRef(0);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    );
    const observer = new ResizeObserver(() => {
      const next = content.offsetHeight;
      const previous = lastHeight.current;
      lastHeight.current = next;
      if (previous === next) return;

      const now = performance.now();
      const continuous = now - lastResize.current < FOLLOW_WINDOW_MS;
      lastResize.current = now;
      setFollowing(continuous);
      setAnimating(
        previous !== undefined && !continuous && !reducedMotion?.matches,
      );
      setHeight(next);
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const stopAnimating = (event: {
    target: EventTarget;
    currentTarget: EventTarget;
  }) => {
    if (event.target === event.currentTarget) setAnimating(false);
  };

  return (
    <div
      className={[
        styles.animatedHeight,
        animating ? styles.animating : "",
        following ? styles.followResize : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ height }}
      onTransitionEnd={stopAnimating}
      onTransitionCancel={stopAnimating}
    >
      <div ref={contentRef} className={styles.animatedContent}>
        {children}
      </div>
    </div>
  );
}
