import React, { useEffect, useMemo, useRef, useCallback, useId } from "react";
import { Group, Loader, Text } from "@mantine/core";
import * as d3 from "d3";
import {
  StackedBarChartProps,
  TooltipData,
  FractionData,
} from "@app/types/charts";
import { generateTooltipHTML } from "@app/components/shared/charts/stackedBarChart/StackedBarTooltip";
import {
  detectTheme,
  getChartThemeVars,
} from "@app/components/shared/charts/utils/themeUtils";
import { createTooltipPositioner } from "@app/components/shared/charts/utils/tooltipUtils";
import {
  createRoundedRectPath,
  createScale,
} from "@app/components/shared/charts/utils/d3Utils";

export default function StackedBarChart({
  fractions,
  width = 640,
  height = 22,
  showLegend = true,
  className = "",
  tooltipPosition = "top",
  loading = false,
  animate = true,
  animationDurationMs = 900,
  ariaLabel,
}: StackedBarChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const hasAnimatedRef = useRef(false);
  const reactId = useId();
  const clipId = useMemo(() => `clip-${reactId}`, [reactId]);

  // Memoize theme detection to avoid recalculation
  const theme = useMemo(() => detectTheme(), []);
  const themeVars = useMemo(
    () => getChartThemeVars(theme.isDark),
    [theme.isDark],
  );

  // Memoize tooltip positioner
  const tooltipPositioner = useMemo(
    () => createTooltipPositioner(tooltipPosition),
    [tooltipPosition],
  );

  const positionTooltip = useCallback(
    (event: MouseEvent) => {
      const tooltip = tooltipRef.current;
      if (!tooltip) return;
      tooltipPositioner.positionTooltip(event, tooltip, containerRef.current!);
    },
    [tooltipPositioner],
  );

  const setTooltipContent = useCallback(
    (labelHtml: string) => {
      const tooltip = tooltipRef.current;
      if (!tooltip) return;
      tooltip.innerHTML = labelHtml;
      tooltip.style.background = themeVars.background;
      tooltip.style.color = themeVars.textPrimary;
      tooltip.style.border = themeVars.border;
      tooltip.style.boxShadow = themeVars.boxShadow;
      tooltip.style.padding = "8px 10px";
      tooltip.style.fontSize = "12px";
      tooltip.style.lineHeight = "1.25";
      tooltip.style.borderRadius = "8px";
    },
    [themeVars],
  );

  const hideTooltip = useCallback(() => {
    const tooltip = tooltipRef.current;
    if (!tooltip) return;
    tooltip.style.opacity = "0";
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";

    // Calculate total capacity (sum of all denominators)
    const totalCapacity = fractions.reduce(
      (sum: number, fraction: FractionData) => sum + fraction.denominator,
      0,
    );

    if (totalCapacity === 0 && !loading) return;

    // Create data for the bar segments
    const data = fractions.map((fraction: FractionData) => ({
      ...fraction,
      value: fraction.numerator,
      remaining: fraction.denominator - fraction.numerator,
    }));

    const radius = 8;

    const svg = d3
      .select(container)
      .append("svg")
      .attr("width", "100%")
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("role", ariaLabel ? "img" : null)
      .attr("aria-label", ariaLabel || null);

    const x = createScale([0, totalCapacity], [0, width]);
    let cursor = 0;
    const g = svg.append("g");

    // Skip drawing the bar visuals entirely when loading to avoid gray bar under spinner
    if (!loading) {
      // Create a single rounded rectangle for the entire bar background
      const totalBarWidth = x(totalCapacity);
      g.append("rect")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", totalBarWidth)
        .attr("height", height)
        .attr("rx", radius)
        .attr("ry", radius)
        .attr("fill", themeVars.inactive)
        .attr("stroke", themeVars.cardBorder);

      // Define a clipPath that will reveal the used portion from left to right
      const defs = svg.append("defs");
      const clipRect = defs
        .append("clipPath")
        .attr("id", clipId)
        .append("rect")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", 0)
        .attr("height", height)
        .attr("rx", radius)
        .attr("ry", radius);

      // Group to hold the used segments and apply clip-path
      const usedGroup = svg.append("g").attr("clip-path", `url(#${clipId})`);

      // Render used segments on top of the background
      data.forEach((fraction: (typeof data)[number], index: number) => {
        if (fraction.value <= 0) return;

        const segWidth = x(fraction.value);
        const xPos = cursor;
        cursor += segWidth;

        const isFirst = index === 0;
        const isLast = index === data.length - 1; // Last segment regardless of remaining

        if (isFirst && isLast) {
          // Single segment: fully rounded
          usedGroup
            .append("rect")
            .attr("x", xPos)
            .attr("y", 0)
            .attr("width", segWidth)
            .attr("height", height)
            .attr("rx", radius)
            .attr("ry", radius)
            .attr("fill", fraction.color);
        } else if (isFirst) {
          // First segment: rounded on left side only
          const path = createRoundedRectPath(
            xPos,
            0,
            segWidth,
            height,
            radius,
            {
              topLeft: true,
              topRight: false,
              bottomLeft: true,
              bottomRight: false,
            },
          );
          usedGroup.append("path").attr("d", path).attr("fill", fraction.color);
        } else if (isLast) {
          // Last segment: rounded on right side only
          const path = createRoundedRectPath(
            xPos,
            0,
            segWidth,
            height,
            radius,
            {
              topLeft: false,
              topRight: true,
              bottomLeft: false,
              bottomRight: true,
            },
          );
          usedGroup.append("path").attr("d", path).attr("fill", fraction.color);
        } else {
          // Middle segments: no rounded edges
          usedGroup
            .append("rect")
            .attr("x", xPos)
            .attr("y", 0)
            .attr("width", segWidth)
            .attr("height", height)
            .attr("fill", fraction.color);
        }
      });

      // Add a transparent overlay for hover events on the entire bar (outside clip path)
      svg
        .append("rect")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", totalBarWidth)
        .attr("height", height)
        .attr("rx", radius)
        .attr("ry", radius)
        .attr("fill", "transparent")
        .style("pointer-events", "all")
        .on("mouseenter", (event: MouseEvent) => {
          const tooltipData: TooltipData = {
            fractions: data,
            isDark: theme.isDark,
          };
          const html = generateTooltipHTML(tooltipData);
          setTooltipContent(html);
          const tooltip = tooltipRef.current;
          if (tooltip) tooltip.style.opacity = "1";
          positionTooltip(event as unknown as MouseEvent);
        })
        .on("mousemove", (event: MouseEvent) =>
          positionTooltip(event as unknown as MouseEvent),
        )
        .on("mouseleave", hideTooltip);

      // Animate reveal of used segments (only on first load, not on re-renders)
      const totalUsed = data.reduce(
        (sum: number, f: (typeof data)[number]) => sum + f.value,
        0,
      );
      const revealTo = x(totalUsed);
      if (animate && !hasAnimatedRef.current) {
        clipRect
          .transition()
          .duration(animationDurationMs)
          .attr("width", revealTo);
        hasAnimatedRef.current = true;
      } else {
        clipRect.attr("width", revealTo);
      }
    }

    return () => {
      container.innerHTML = "";
    };
  }, [
    fractions,
    width,
    height,
    tooltipPosition,
    loading,
    animate,
    animationDurationMs,
    clipId,
    themeVars,
    setTooltipContent,
    hideTooltip,
    positionTooltip,
  ]);

  return (
    <div className={className}>
      <div style={{ position: "relative" }}>
        <div ref={containerRef} />
        <div
          ref={tooltipRef}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            pointerEvents: "none",
            opacity: 0,
            transition: "opacity 120ms ease",
            zIndex: 1000,
          }}
        />
        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Loader size="sm" color="blue" />
          </div>
        )}
      </div>

      {showLegend && (
        <Group gap="lg" mt="sm">
          {fractions.map((fraction: FractionData, index: number) => (
            <Group key={index} gap={6}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  background: fraction.color,
                  display: "inline-block",
                  borderRadius: 2,
                }}
              />
              <Text size="sm">{fraction.name}</Text>
            </Group>
          ))}
          <Group gap={6}>
            <span
              style={{
                width: 10,
                height: 10,
                background: themeVars.inactive,
                display: "inline-block",
                borderRadius: 2,
                outline: `1px solid ${themeVars.cardBorder}`,
              }}
            />
            <Text size="sm">Remaining</Text>
          </Group>
        </Group>
      )}
    </div>
  );
}
