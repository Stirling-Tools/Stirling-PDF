import React from "react";
import { TooltipData } from "@app/types/charts";

interface StackedBarTooltipProps {
  data: TooltipData;
}

export default function StackedBarTooltip({ data }: StackedBarTooltipProps) {
  const { fractions } = data;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        whiteSpace: "nowrap",
      }}
    >
      {fractions.map((f, index) => (
        <div
          key={index}
          style={{ display: "flex", gap: "8px", alignItems: "center" }}
        >
          <span
            style={{
              display: "inline-block",
              width: "10px",
              height: "10px",
              background: f.color,
              borderRadius: "2px",
            }}
          ></span>
          <span>
            <strong>{f.name}</strong> — {f.numeratorLabel}: {f.numerator} ·{" "}
            {f.denominatorLabel}: {f.denominator - f.numerator}
          </span>
        </div>
      ))}
    </div>
  );
}

export function generateTooltipHTML(data: TooltipData): string {
  const { fractions } = data;

  return `
    <div style="display:flex;flex-direction:column;gap:6px;white-space:nowrap;">
      ${fractions
        .map(
          (f) => `
        <div style="display:flex;gap:8px;align-items:center;">
          <span style="display:inline-block;width:10px;height:10px;background:${f.color};border-radius:2px"></span>
          <span><strong>${f.name}</strong> — ${f.numeratorLabel}: ${f.numerator} · ${f.denominatorLabel}: ${Math.max(0, f.denominator - f.numerator)}</span>
        </div>
      `,
        )
        .join("")}
    </div>`;
}
