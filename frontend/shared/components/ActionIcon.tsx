import { ActionIcon as MantineActionIcon } from "@mantine/core";
import type {
  ComponentPropsWithRef,
  CSSProperties,
  ElementType,
  ReactNode,
} from "react";
import "@shared/components/ActionIcon.css";

/** Icon-only button. Same dials as Button:
 *   variant = primary (filled) | secondary (outlined) | tertiary (ghost)
 *   accent  = default | neutral | brand | ai | premium | danger | success | warning
 * Use this instead of an icon-only <Button> — it's square by construction and
 * sizes the icon with the control. */
export type ActionIconVariant = "primary" | "secondary" | "tertiary";
export type ActionIconAccent =
  | "default"
  | "neutral"
  | "brand"
  | "ai"
  | "premium"
  | "danger"
  | "success"
  | "warning";
export type ActionIconSize = "sm" | "md" | "lg" | "xl";
export type ActionIconShape = "default" | "circle" | "pill";

type ActionIconOwnProps = {
  variant?: ActionIconVariant;
  accent?: ActionIconAccent;
  size?: ActionIconSize;
  shape?: ActionIconShape;
  /** Required — an icon-only control must have an accessible name. */
  "aria-label": string;
  loading?: boolean;
  /** Polymorphic root element (e.g. `"a"` or a router Link). */
  as?: ElementType;
  style?: CSSProperties;
  /** The icon. */
  children?: ReactNode;
};

export type ActionIconProps = ActionIconOwnProps &
  Omit<ComponentPropsWithRef<"button">, keyof ActionIconOwnProps | "color"> & {
    href?: string;
    target?: string;
    rel?: string;
  };

const MANTINE_VARIANT: Record<ActionIconVariant, string> = {
  primary: "filled",
  secondary: "outline",
  tertiary: "subtle",
};

export function ActionIcon({
  variant = "primary",
  accent = "default",
  size = "md",
  shape = "default",
  loading = false,
  as,
  disabled,
  className,
  style,
  children,
  ...rest
}: ActionIconProps) {
  const classes = [
    "sui-ai",
    `sui-acc-${accent}`,
    `sui-ai--${variant}`,
    shape !== "default" ? `sui-ai--${shape}` : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  // Map the accent palette onto Mantine's ActionIcon vars; inline so they win
  // over Mantine's computed defaults. --ai-bd is a full `border` shorthand.
  const accentVars =
    variant === "primary"
      ? {
          "--ai-bg": "var(--_solid)",
          "--ai-hover": "var(--_solid-hover)",
          "--ai-color": "var(--_on)",
          "--ai-bd": "1px solid transparent",
        }
      : {
          "--ai-bg": "transparent",
          "--ai-hover": "var(--_tint)",
          "--ai-color": "var(--_text)",
          "--ai-bd":
            variant === "secondary"
              ? "1px solid var(--_bd)"
              : "1px solid transparent",
        };

  // Mantine ActionIcon is polymorphic; render through a loosely-typed alias so
  // `component={as}` doesn't fight Mantine's generic typing.
  const Comp = MantineActionIcon as ElementType;

  return (
    <Comp
      {...rest}
      component={as}
      variant={MANTINE_VARIANT[variant]}
      size={size}
      loading={loading}
      disabled={disabled}
      className={classes}
      style={{ ...(accentVars as CSSProperties), ...style }}
    >
      {children}
    </Comp>
  );
}
