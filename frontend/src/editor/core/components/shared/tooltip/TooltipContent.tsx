import React from "react";
import styles from "@editor/components/shared/tooltip/Tooltip.module.css";
import type { TooltipTip } from "@editor/types/tips";
import "@editor/ui/InfoTooltip.css";

interface TooltipContentProps {
  content?: React.ReactNode;
  tips?: TooltipTip[];
  extraRightPadding?: number;
}

/**
 * Structured explanation body shared by the legacy rich tooltip and the
 * standard `InfoTooltip`. It never parses HTML: callers pass text or JSX, so a
 * translation can never inject markup into the page.
 */
export const TooltipContent: React.FC<TooltipContentProps> = ({
  content,
  tips,
  extraRightPadding = 0,
}) => {
  return (
    <div
      className={styles["tooltip-body"]}
      style={{ paddingRight: 16 + extraRightPadding }}
    >
      {tips ? (
        <>
          {tips.map((tip, index) => (
            <section
              className="sui-info-panel__section"
              key={`${tip.title ?? "tip"}-${index}`}
            >
              {tip.title && (
                <h3 className="sui-info-panel__section-title">{tip.title}</h3>
              )}
              {tip.description && (
                <p className="sui-info-panel__text">{tip.description}</p>
              )}
              {tip.bullets && tip.bullets.length > 0 && (
                <ul className="sui-info-panel__list">
                  {tip.bullets.map((bullet, bulletIndex) => (
                    <li key={bulletIndex}>{bullet}</li>
                  ))}
                </ul>
              )}
              {tip.body && (
                <div className="sui-info-panel__body-extra">{tip.body}</div>
              )}
            </section>
          ))}
          {content && <div className="sui-info-panel__extra">{content}</div>}
        </>
      ) : (
        <div className="sui-info-panel__text">{content}</div>
      )}
    </div>
  );
};
