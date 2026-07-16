// Inline styles for the audit panel (dev-only, no shipped stylesheet).

import { type CSSProperties } from "react";

export const cell: CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid var(--c-border, #e5e7eb)",
  textAlign: "left",
  verticalAlign: "top",
  fontSize: 13,
};

export const swatch = (c: string): CSSProperties => ({
  display: "inline-block",
  width: 12,
  height: 12,
  borderRadius: 3,
  background: c,
  border: "1px solid var(--c-border, #ccc)",
  marginRight: 6,
  verticalAlign: "middle",
});

const btnBase: CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  border: "1px solid transparent",
  lineHeight: 1,
};

export const btnPrimary: CSSProperties = {
  ...btnBase,
  background: "var(--color-blue, #3b82f6)",
  color: "#fff",
};

export const btnDanger: CSSProperties = {
  ...btnBase,
  background: "var(--color-red, #dc2626)",
  color: "#fff",
};

export const btnGhost = (enabled: boolean): CSSProperties => ({
  ...btnBase,
  fontWeight: 500,
  background: "var(--c-surface, #fff)",
  color: "inherit",
  border: "1px solid var(--c-border, #d4d4d8)",
  cursor: enabled ? "pointer" : "not-allowed",
  opacity: enabled ? 1 : 0.5,
});

export const controlGroup: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 12px",
  borderRadius: 8,
  background: "var(--c-surface-sunken, var(--color-bg-subtle, #f3f4f6))",
  border: "1px solid var(--c-border, #e5e7eb)",
  fontSize: 13,
};
