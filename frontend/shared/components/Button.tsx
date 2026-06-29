import { Button as MantineButton } from "@mantine/core";
import type {
  ComponentPropsWithRef,
  CSSProperties,
  ElementType,
  ReactNode,
} from "react";
import "@shared/components/Button.css";

/** primary=solid CTA, secondary=outlined, tertiary=ghost (transparent, tinted on hover). */
export type ButtonVariant = "primary" | "secondary" | "tertiary";
/** Unset = `default` (blue). neutral=grey low-emphasis, brand=Stirling red,
 * ai=AI gradient, premium=purple upgrade gradient, danger/success/warning=semantic. */
export type ButtonAccent =
  | "default"
  | "neutral"
  | "brand"
  | "ai"
  | "premium"
  | "danger"
  | "success"
  | "warning";
export type ButtonSize = "sm" | "md" | "lg" | "xl";
/** `between` pins leftSection/label/rightSection to left/center/right (toolbar rows). */
export type ButtonJustify = "center" | "start" | "end" | "between";
export type ButtonShape = "default" | "circle" | "pill";

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
  style?: CSSProperties;
  children?: ReactNode;
};

export type ButtonProps = ButtonOwnProps &
  Omit<ComponentPropsWithRef<"button">, keyof ButtonOwnProps | "color"> & {
    href?: string;
    target?: string;
    rel?: string;
    htmlFor?: string;
  };

export interface ButtonGroupProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

function ButtonGroup({ children, className, style }: ButtonGroupProps) {
  return (
    <MantineButton.Group className={className} style={style}>
      {children}
    </MantineButton.Group>
  );
}

const MANTINE_VARIANT: Record<ButtonVariant, string> = {
  primary: "filled",
  secondary: "outline",
  tertiary: "subtle",
};

const MANTINE_JUSTIFY: Record<ButtonJustify, string> = {
  center: "center",
  start: "flex-start",
  end: "flex-end",
  between: "space-between",
};

function ButtonRoot({
  variant = "primary",
  accent = "default",
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
  className,
  style,
  children,
  ...rest
}: ButtonProps) {
  const label = text ?? children;
  const hasLabel = label != null && label !== false && label !== "";
  const iconOnly = !hasLabel && (!!leftSection || !!rightSection || loading);

  // Sections flank a label → spread them without requiring justify="between".
  const effectiveJustify =
    justify === "center" && hasLabel && !!leftSection && !!rightSection
      ? "between"
      : justify;

  const classes = [
    "sui-btn",
    `sui-acc-${accent}`,
    `sui-btn--${variant}`,
    iconOnly ? "sui-btn--icon" : "",
    shape !== "default" ? `sui-btn--${shape}` : "",
    overflow === "wrap" ? "sui-btn--wrap" : "",
    !hover ? "sui-btn--no-hover" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  // Map the accent palette (set by the accent class) onto Mantine's button
  // vars; inline so they win over Mantine's computed defaults.
  // NB: --button-bd is Mantine's full `border` shorthand, not just a colour —
  // a bare colour is an invalid border value and renders no border (which made
  // secondary look identical to tertiary). Always pass `<width> solid <colour>`.
  const accentVars =
    variant === "primary"
      ? {
          "--button-bg": "var(--_solid)",
          "--button-hover": "var(--_solid-hover)",
          "--button-color": "var(--_on)",
          "--button-bd": "1px solid transparent",
        }
      : {
          "--button-bg": "transparent",
          "--button-hover": "var(--_tint)",
          "--button-color": "var(--_text)",
          "--button-bd":
            variant === "secondary"
              ? "1px solid var(--_bd)"
              : "1px solid transparent",
        };

  // Mantine Button is polymorphic; render through a loosely-typed alias so the
  // dynamic `component={as}` prop doesn't fight Mantine's generic typing. Our
  // ButtonProps above stays the typed public surface.
  const Comp = MantineButton as ElementType;

  return (
    <Comp
      {...rest}
      component={as}
      variant={MANTINE_VARIANT[variant]}
      size={size}
      justify={MANTINE_JUSTIFY[effectiveJustify]}
      leftSection={leftSection}
      rightSection={rightSection}
      loading={loading}
      fullWidth={fullWidth}
      disabled={disabled}
      className={classes}
      style={{ ...(accentVars as CSSProperties), ...style }}
    >
      {label}
    </Comp>
  );
}

export const Button = Object.assign(ButtonRoot, { Group: ButtonGroup });
