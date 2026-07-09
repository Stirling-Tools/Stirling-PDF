import { Button as MantineButton } from "@mantine/core";
import { forwardRef } from "react";
import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  ElementType,
  ReactNode,
} from "react";
import { CONTROL_HEIGHT } from "@app/ui/controlSizes";
import "@app/ui/Button.css";

/** primary=solid, secondary=outlined, tertiary=ghost (tinted hover), quiet=plain (no bg, hovers to text colour). */
export type ButtonVariant = "primary" | "secondary" | "tertiary" | "quiet";
/** default(blue) | neutral | brand | ai | premium | danger | success | warning. */
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
  Omit<ComponentPropsWithoutRef<"button">, keyof ButtonOwnProps | "color"> & {
    href?: string;
    target?: string;
    rel?: string;
    htmlFor?: string;
  };

export interface ButtonGroupProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  orientation?: "horizontal" | "vertical";
  /** Border width between attached buttons (Mantine `--button-border-width`). */
  borderWidth?: number | string;
}

function ButtonGroup({
  children,
  className,
  style,
  orientation,
  borderWidth,
}: ButtonGroupProps) {
  return (
    <MantineButton.Group
      className={className}
      style={style}
      orientation={orientation}
      borderWidth={borderWidth}
    >
      {children}
    </MantineButton.Group>
  );
}

const MANTINE_VARIANT: Record<ButtonVariant, string> = {
  primary: "filled",
  secondary: "outline",
  tertiary: "subtle",
  quiet: "subtle",
};

const MANTINE_JUSTIFY: Record<ButtonJustify, string> = {
  center: "center",
  start: "flex-start",
  end: "flex-end",
  between: "space-between",
};

const ButtonRoot = forwardRef<HTMLButtonElement, ButtonProps>(
  function ButtonRoot(
    {
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
    },
    ref,
  ) {
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

    // Accent palette → Mantine button vars (inline to win). --button-bd is a full `border` shorthand.
    const accentVars =
      variant === "primary"
        ? {
            "--button-bg": "var(--_solid)",
            "--button-hover": "var(--_solid-hover)",
            "--button-color": "var(--_on)",
            "--button-bd": "1px solid transparent",
          }
        : variant === "quiet"
          ? {
              "--button-bg": "transparent",
              "--button-hover": "transparent",
              "--button-color": "var(--_text)",
              "--button-hover-color": "var(--color-text-1)",
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

    // Loosely-typed alias so the polymorphic `component={as}` doesn't fight Mantine's typing.
    const Comp = MantineButton as ElementType;

    return (
      <Comp
        {...rest}
        ref={ref}
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
        style={{
          ...(accentVars as CSSProperties),
          ...({ "--button-height": CONTROL_HEIGHT[size] } as CSSProperties),
          // Icon-only: zero the size padding inline so the lone icon centres.
          ...(iconOnly ? ({ "--button-padding-x": "0" } as CSSProperties) : {}),
          ...style,
        }}
      >
        {label}
      </Comp>
    );
  },
);

export const Button = Object.assign(ButtonRoot, { Group: ButtonGroup });
