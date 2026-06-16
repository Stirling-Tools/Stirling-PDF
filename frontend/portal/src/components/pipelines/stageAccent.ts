import type { StageKey } from "@portal/api/pipelines";
import type { OpKind } from "@shared/data/ops";

/**
 * Fixed accent per stage so the chip row reads the same across every pipeline.
 * Each value is also a valid {@link import("@shared/components").ChipTone}, so
 * it doubles as the chip tone wherever a stage colour is rendered.
 */
export type StageAccent = "green" | "blue" | "amber" | "red" | "purple";

export const STAGE_ACCENT: Record<StageKey, StageAccent> = {
  ingest: "green",
  validate: "blue",
  modify: "amber",
  secure: "red",
  route: "purple",
};

/** Op-kind accent mirrors the stage palette; alerts share the route colour. */
export const OP_KIND_ACCENT: Record<OpKind, StageAccent> = {
  ingest: "green",
  validate: "blue",
  modify: "amber",
  secure: "red",
  store: "purple",
  alert: "purple",
};

export const STAGE_COLOR_VAR: Record<StageAccent, string> = {
  green: "var(--color-green)",
  blue: "var(--color-blue)",
  amber: "var(--color-amber)",
  red: "var(--color-red)",
  purple: "var(--color-purple)",
};
