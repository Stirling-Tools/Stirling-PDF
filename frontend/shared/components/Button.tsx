import type {
  ComponentPropsWithRef,
  CSSProperties,
  ElementType,
  ReactNode,
} from "react";
import "@shared/components/Button.css";

export type ButtonVariant = "filled" | "outlined" | "ghost";
/** neutral=plain, brand=Stirling-red CTA. */
export type ButtonAccent =
  | "neutral"
  | "brand"
  | "danger"
  | "warning"
  | "success";
export type ButtonSize = "sm" | "md" | "lg" | "xl";
/** `between` pins leftSection/label/rightSection to left/center/right (toolbar rows). */
export type ButtonJustify = "center" | "start" | "end" | "between";
export type ButtonShape = "default" | "circle" | "pill";

/** Accepts `--sui-btn-bg`/`-fg`/`-bd` color-override vars alongside standard style properties. */
export type ButtonStyle = CSSProperties &
  Partial<Record<"--sui-btn-bg" | "--sui-btn-fg" | "--sui-btn-bd", string>>;

type ButtonOwnProps = {
  variant?: ButtonVariant;
  accent?: ButtonAccent;
  size?: ButtonSize;
  justify?: ButtonJustify;
  shape?: ButtonShape;
  /** Alternative to children; use one or the other. */
  text?: ReactNode;
  leftSection?: ReactNode;
  rightSection?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
  /** false = no hover background change. */
  hover?: boolean;
  overflow?: "wrap" | "hidden";
  /** Polymorphic root element (e.g. `"a"` or a router Link). */
  as?: ElementType;
  /** Accepts `--sui-btn-bg`/`-fg`/`-bd` override vars. */
  style?: ButtonStyle;
  children?: ReactNode;
};

export type ButtonProps = ButtonOwnProps &
  Omit<ComponentPropsWithRef<"button">, keyof ButtonOwnProps | "color"> & {
    href?: string;
    target?: string;
    rel?: string;
  };

export interface ButtonGroupProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

function ButtonGroup({ children, className, style }: ButtonGroupProps) {
  return (
    <div
      className={["sui-btn-group", className].filter(Boolean).join(" ")}
      style={style}
    >
      {children}
    </div>
  );
}

function ButtonRoot({
  variant = "filled",
  accent = "neutral",
  size = "md",
  justify = "center",
  shape = "default",
  text,
  leftSection,
  rightSection,
  loading = false,
  fullWidth = false,
  hover = true,
  overflow = "wrap",
  as,
  disabled,
  onClick,
  className,
  style,
  children,
  ...rest
}: ButtonProps) {
  const Comp = (as ?? "button") as ElementType;
  const isNativeButton = Comp === "button";
  const blocked = disabled || loading;
  // Non-button elements don't get disabled natively, so block clicks manually.
  const safeOnClick =
    blocked && !isNativeButton
      ? (e: React.MouseEvent) => e.preventDefault()
      : onClick;

  const label = text ?? children;
  const hasLabel = label != null && label !== false && label !== "";
  const iconOnly = !hasLabel && (!!leftSection || !!rightSection || loading);

  // When both sections flank a label, spread them automatically without requiring justify="between".
  const effectiveJustify =
    justify === "center" && hasLabel && !!leftSection && !!rightSection
      ? "between"
      : justify;

  const classes = [
    "sui-btn",
    `sui-btn--${variant}`,
    `sui-btn--${accent}`,
    `sui-btn--${size}`,
    iconOnly ? "sui-btn--icon" : "",
    effectiveJustify !== "center" ? `sui-btn--justify-${effectiveJustify}` : "",
    shape !== "default" ? `sui-btn--${shape}` : "",
    fullWidth ? "sui-btn--full" : "",
    loading ? "sui-btn--loading" : "",
    !hover ? "sui-btn--no-hover" : "",
    overflow === "hidden" ? "sui-btn--overflow-hidden" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const leadingIcon = loading ? (
    <span className="sui-btn__spinner" aria-hidden />
  ) : (
    leftSection
  );
  const trailingIcon = loading ? null : rightSection;

  return (
    <Comp
      {...rest}
      onClick={safeOnClick}
      className={classes}
      style={style}
      {...(isNativeButton
        ? { disabled: blocked }
        : { "aria-disabled": blocked || undefined })}
    >
      {leadingIcon}
      {hasLabel && <span className="sui-btn__label">{label}</span>}
      {trailingIcon}
    </Comp>
  );
}

export const Button = Object.assign(ButtonRoot, { Group: ButtonGroup });
