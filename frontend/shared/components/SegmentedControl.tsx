import { useLayoutEffect, useRef, useCallback } from "react";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import "@shared/components/SegmentedControl.css";

export type SegmentedNamedAccent =
  | "neutral"
  | "blue"
  | "purple"
  | "green"
  | "amber"
  | "red";
/** Named palette accent or any CSS colour (`var(--x)`, hex, rgb). */
export type SegmentedAccent = SegmentedNamedAccent | (string & {});
export type SegmentedSize = "xs" | "sm" | "md" | "lg";
/** `solid` = raised card on a boxed track; `subtle` = accent-tinted pill, no track chrome. */
export type SegmentedVariant = "solid" | "subtle";

const NAMED_ACCENTS: readonly string[] = [
  "neutral",
  "blue",
  "purple",
  "green",
  "amber",
  "red",
];

export interface SegmentedOption<T extends string> {
  label: ReactNode;
  value: T;
  disabled?: boolean;
}

/** Stateless action button inside the control — never moves the indicator or changes the value. */
export interface SegmentedAction {
  label: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

export type SegmentedItem<T extends string> =
  | SegmentedOption<T>
  | SegmentedAction;

function isAction<T extends string>(
  item: SegmentedItem<T>,
): item is SegmentedAction {
  return "onClick" in item && !("value" in item);
}

export interface SegmentedControlProps<T extends string> extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange"
> {
  options: SegmentedItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Only tints the `subtle` variant. Named palette or any CSS colour. */
  accent?: SegmentedAccent;
  size?: SegmentedSize;
  variant?: SegmentedVariant;
  fullWidth?: boolean;
  /** Disables and dims the whole control. */
  loading?: boolean;
  /** Class applied to every individual segment button. */
  itemClassName?: string;
}

/** Single-select control with a sliding highlight element. Mix in SegmentedAction entries for stateless action buttons. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accent = "neutral",
  size = "md",
  variant = "solid",
  fullWidth = false,
  loading = false,
  itemClassName,
  className,
  style,
  ...rest
}: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const activeIndex = options.findIndex(
    (item) => !isAction(item) && item.value === value,
  );

  // Move the indicator via direct DOM mutation to avoid a state round-trip.
  const placeIndicator = useCallback((index: number) => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    if (!container || !indicator) return;
    const items = container.querySelectorAll<HTMLElement>(
      ".sui-segmented__item",
    );
    const active = items[index];
    if (!active) return;
    indicator.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
    indicator.style.width = `${active.offsetWidth}px`;
    indicator.style.height = `${active.offsetHeight}px`;
  }, []);

  // useLayoutEffect so the indicator is positioned before first paint.
  useLayoutEffect(() => {
    placeIndicator(activeIndex);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => placeIndicator(activeIndex));
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [activeIndex, options, size, variant, fullWidth, placeIndicator]);

  const isNamedAccent = NAMED_ACCENTS.includes(accent);
  const classes = [
    "sui-segmented",
    `sui-segmented--${size}`,
    `sui-segmented--${variant}`,
    isNamedAccent ? `sui-segmented--${accent}` : "",
    fullWidth ? "sui-segmented--full" : "",
    loading ? "sui-segmented--loading" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const mergedStyle: CSSProperties | undefined = isNamedAccent
    ? style
    : ({ "--sui-seg-fg": accent, ...style } as CSSProperties);

  return (
    <div
      className={classes}
      role="group"
      style={mergedStyle}
      ref={containerRef}
      {...rest}
    >
      <span
        ref={indicatorRef}
        className="sui-segmented__indicator"
        aria-hidden
      />
      {options.map((item, i) => {
        if (isAction(item)) {
          return (
            <button
              key={`__action__${i}`}
              type="button"
              className={[
                "sui-segmented__item",
                "sui-segmented__item--action",
                itemClassName,
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={item.disabled || loading}
              onClick={item.onClick}
            >
              {item.label}
            </button>
          );
        }
        return (
          <button
            key={item.value}
            type="button"
            className={["sui-segmented__item", itemClassName]
              .filter(Boolean)
              .join(" ")}
            aria-pressed={value === item.value}
            disabled={item.disabled || loading}
            onClick={() => {
              placeIndicator(i);
              onChange(item.value);
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
