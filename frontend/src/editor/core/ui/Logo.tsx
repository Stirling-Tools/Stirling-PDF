import type { CSSProperties } from "react";
import markUrl from "@editor/assets/brand/branding-logo/logo-mark.svg";
import wordmarkLightUrl from "@editor/assets/brand/branding-logo/wordmark-light.svg";
import wordmarkDarkUrl from "@editor/assets/brand/branding-logo/wordmark-dark.svg";
import "@editor/ui/Logo.css";

/** iconOnly = mark; textOnly = "Stirling" wordmark; iconAndText = both. */
export type LogoVariant = "iconOnly" | "iconAndText" | "textOnly";

interface LogoProps {
  variant?: LogoVariant;
  /** Layout for iconAndText: mark left of text, or stacked above it. */
  orientation?: "horizontal" | "vertical";
  /** Height of the mark (CSS length). */
  iconHeight?: string;
  /** Height of the wordmark (CSS length). */
  textHeight?: string;
  /** Gap between mark and wordmark. */
  gap?: string;
  className?: string;
  style?: CSSProperties;
  alt?: string;
}

/**
 * Shared brand lockup used across editor + processor. The mark is theme-
 * agnostic; the wordmark swaps light/dark via CSS so it tracks the active
 * colour scheme in both the editor (data-mantine-color-scheme) and the portal
 * (data-theme).
 */
export function Logo({
  variant = "iconAndText",
  orientation = "horizontal",
  iconHeight = "1.75rem",
  textHeight = "1rem",
  gap = "0.5rem",
  className,
  style,
  alt = "Stirling",
}: LogoProps) {
  const showIcon = variant === "iconOnly" || variant === "iconAndText";
  const showText = variant === "textOnly" || variant === "iconAndText";

  const cls = [
    "sui-logo",
    orientation === "vertical" ? "sui-logo--vertical" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  // Layout set inline so a consumer's className can't restack the lockup.
  const layoutStyle: CSSProperties = {
    display: orientation === "vertical" ? "flex" : "inline-flex",
    flexDirection: orientation === "vertical" ? "column" : "row",
    alignItems: "center",
    gap,
  };

  return (
    <span className={cls} style={{ ...layoutStyle, ...style }}>
      {showIcon && (
        <img
          className="sui-logo__mark"
          src={markUrl}
          alt={showText ? "" : alt}
          aria-hidden={showText ? true : undefined}
          style={{ height: iconHeight }}
        />
      )}
      {showText && (
        <>
          <img
            className="sui-logo__wordmark sui-logo__wordmark--light"
            src={wordmarkLightUrl}
            alt={alt}
            style={{ height: textHeight }}
          />
          <img
            className="sui-logo__wordmark sui-logo__wordmark--dark"
            src={wordmarkDarkUrl}
            alt={alt}
            style={{ height: textHeight }}
          />
        </>
      )}
    </span>
  );
}
