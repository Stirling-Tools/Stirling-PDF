import "@shared/components/Avatar.css";

export type AvatarSize = "xs" | "sm" | "md" | "lg";
export type AvatarTone =
  | "blue"
  | "purple"
  | "green"
  | "amber"
  | "red"
  | "neutral";

export interface AvatarProps {
  /** Image source. Falls back to initials when missing or load fails. */
  src?: string;
  /** Full name. Initials are derived from the first letter of each word, max 2. */
  name: string;
  size?: AvatarSize;
  /** Background tone when rendering initials. Defaults to blue. */
  tone?: AvatarTone;
  /** Optional click handler — renders as a button when supplied. */
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Round avatar showing either an image or coloured initials. Used by the
 * Header account button, reviewer rows, and assistant message gutters.
 */
export function Avatar({
  src,
  name,
  size = "md",
  tone = "blue",
  onClick,
  ariaLabel,
  className,
}: AvatarProps) {
  const classes = [
    "sui-avatar",
    `sui-avatar--${size}`,
    `sui-avatar--${tone}`,
    onClick ? "sui-avatar--interactive" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = src ? (
    <img src={src} alt={ariaLabel ?? name} className="sui-avatar__img" />
  ) : (
    <span aria-hidden>{initialsOf(name)}</span>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        onClick={onClick}
        aria-label={ariaLabel ?? name}
      >
        {content}
      </button>
    );
  }
  return (
    <span className={classes} role="img" aria-label={ariaLabel ?? name}>
      {content}
    </span>
  );
}
