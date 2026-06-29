import type { StageKey } from "@portal/api/pipelines";
import type { OpKind } from "@shared/data/ops";

/**
 * Fixed accent per stage so the chip row reads the same across every pipeline.
 * Each value is also a valid {@link import("@shared/components").ChipAccent}, so
 * it doubles as the chip accent wherever a stage colour is rendered.
 */
export type StageAccent =
  | "success"
  | "default"
  | "warning"
  | "danger"
  | "premium";

export const STAGE_ACCENT: Record<StageKey, StageAccent> = {
  ingest: "success",
  validate: "default",
  modify: "warning",
  secure: "danger",
  route: "premium",
};

/** Op-kind accent mirrors the stage palette; alerts share the route colour. */
export const OP_KIND_ACCENT: Record<OpKind, StageAccent> = {
  ingest: "success",
  validate: "default",
  modify: "warning",
  secure: "danger",
  store: "premium",
  alert: "premium",
};

export const STAGE_COLOR_VAR: Record<StageAccent, string> = {
  success: "var(--color-green)",
  default: "var(--color-blue)",
  warning: "var(--color-amber)",
  danger: "var(--color-red)",
  premium: "var(--color-purple)",
};
