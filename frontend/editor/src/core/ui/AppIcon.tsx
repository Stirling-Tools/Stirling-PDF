import type { CSSProperties } from "react";
import type { SvgIconComponent } from "@mui/icons-material";
import LocalIcon from "@app/components/shared/LocalIcon";

interface AppIconCommonProps {
  size?: string | number;
  color?: CSSProperties["color"];
  className?: string;
  style?: CSSProperties;
  label?: string;
}

type AppIconSource =
  | { mui: SvgIconComponent; symbol?: never }
  | { mui?: never; symbol: string };

export type AppIconProps = AppIconCommonProps & AppIconSource;

/**
 * Renders static Material Icons and local Material Symbols through one API.
 * Prefer `mui` for exact MUI catalog matches and `symbol` for dynamic or
 * Material-Symbol-only glyphs.
 */
export function AppIcon({
  mui: MuiIcon,
  symbol,
  size = 18,
  color,
  className,
  style,
  label,
}: AppIconProps) {
  const iconStyle = { ...style, color, fontSize: size };
  const accessibilityProps = label
    ? ({ "aria-label": label, role: "img" } as const)
    : ({ "aria-hidden": true } as const);

  if (MuiIcon) {
    return (
      <MuiIcon
        className={className}
        style={iconStyle}
        titleAccess={label}
        {...accessibilityProps}
      />
    );
  }

  return (
    <LocalIcon
      icon={symbol}
      width={size}
      height={size}
      className={className}
      style={iconStyle}
      {...accessibilityProps}
    />
  );
}
