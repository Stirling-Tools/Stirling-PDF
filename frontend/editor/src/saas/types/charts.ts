export interface FractionData {
  name: string;
  numerator: number;
  denominator: number;
  numeratorLabel: string;
  denominatorLabel: string;
  color: string;
}

export type TooltipPosition = "top" | "bottom" | "left" | "right";

export interface StackedBarChartProps {
  fractions: FractionData[];
  width?: number;
  height?: number;
  showLegend?: boolean;
  className?: string;
  tooltipPosition?: TooltipPosition;
  loading?: boolean;
  animate?: boolean;
  animationDurationMs?: number;
  ariaLabel?: string;
}

export interface TooltipData {
  fractions: FractionData[];
  isDark: boolean;
}
