import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import "@shared/components/Chip.css";
import { Button } from "@shared/components/Button";

export type ChipNamedAccent =
  | "neutral"
  | "blue"
  | "purple"
  | "green"
  | "amber"
  | "red";
/** Named palette accent or any CSS colour (`var(--x)`, hex, rgb). */
export type ChipAccent = ChipNamedAccent | (string & {});
export type ChipSize = "xs" | "sm" | "md" | "lg";

/** Accepts `--sui-chip-bg`/`-fg`/`-bd` color-override vars. */
export type ChipStyle = CSSProperties &
  Partial<Record<"--sui-chip-bg" | "--sui-chip-fg" | "--sui-chip-bd", string>>;

const NAMED_ACCENTS: readonly string[] = [
  "neutral",
  "blue",
  "purple",
  "green",
  "amber",
  "red",
];

function customAccentVars(color: string): CSSProperties {
  return {
    "--sui-chip-bg": `color-mix(in srgb, ${color} 14%, transparent)`,
    "--sui-chip-fg": color,
    "--sui-chip-bd": `color-mix(in srgb, ${color} 35%, transparent)`,
  } as CSSProperties;
}

export interface ChipProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "onClick" | "style"
> {
  accent?: ChipAccent;
  size?: ChipSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  /** Shows a spinner and dims the chip. */
  loading?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
  /** Leading status dot. Use for status-style chips. */
  showDot?: boolean;
  style?: ChipStyle;
  children?: ReactNode;
  className?: string;
}

/** Open-ended chip/tag. For semantic status use StatusBadge instead. */
export function Chip({
  accent = "neutral",
  size = "md",
  leadingIcon,
  trailingIcon,
  loading = false,
  onRemove,
  onClick,
  showDot,
  style,
  children,
  className,
  ...rest
}: ChipProps) {
  const Tag = onClick ? "button" : "span";
  const isNamedAccent = NAMED_ACCENTS.includes(accent);
  const classes = [
    "sui-chip",
    isNamedAccent ? `sui-chip--${accent}` : "",
    `sui-chip--${size}`,
    onClick ? "sui-chip--interactive" : "",
    loading ? "sui-chip--loading" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const mergedStyle: ChipStyle | undefined = isNamedAccent
    ? style
    : { ...customAccentVars(accent), ...style };

  return (
    <Tag
      className={classes}
      onClick={loading ? undefined : onClick}
      type={onClick ? "button" : undefined}
      style={mergedStyle}
      {...rest}
    >
      {showDot && <span className="sui-chip__dot" aria-hidden />}
      {loading ? (
        <span className="sui-chip__spinner" aria-hidden />
      ) : leadingIcon ? (
        <span className="sui-chip__icon" aria-hidden>
          {leadingIcon}
        </span>
      ) : null}
      <span className="sui-chip__label">{children}</span>
      {trailingIcon && !onRemove && (
        <span className="sui-chip__icon" aria-hidden>
          {trailingIcon}
        </span>
      )}
      {onRemove && (
        <Button
          variant="ghost"
          shape="circle"
          className="sui-chip__remove"
          leftSection={<>×</>}
          aria-label="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        />
      )}
    </Tag>
  );
}
