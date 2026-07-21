import type { SlideConfig } from "@app/types/types";
import type { ButtonAccent } from "@app/ui/Button";

/**
 * Shared shape for onboarding slide flows. Both the core/editor flow and the
 * SaaS flow describe the same thing — a sequence of slides, each with a hero,
 * body content, and a row of buttons — so the structure lives here once and is
 * parameterised per flow by its own action/hero/state unions. Previously these
 * interfaces were copy-pasted into each flow config.
 */

export interface OSOption {
  label: string;
  url: string;
  value: string;
}

export interface ButtonDefinition<Action extends string, State> {
  key: string;
  type: "button" | "icon";
  label?: string;
  icon?: "chevron-left";
  variant?: "primary" | "secondary" | "default";
  /** Accent for the shared Button; defaults to neutral. */
  accent?: ButtonAccent;
  group: "left" | "right";
  action: Action;
  disabledWhen?: (state: State) => boolean;
}

export interface HeroDefinition<Hero extends string> {
  type: Hero;
}

export interface SlideDefinition<
  Id extends string,
  Action extends string,
  State,
  Hero extends string,
  Params,
> {
  id: Id;
  createSlide: (params: Params) => SlideConfig;
  hero: HeroDefinition<Hero>;
  buttons: ButtonDefinition<Action, State>[];
}

/** A single entry in a conditionally-resolved flow. */
export interface FlowStep<Id extends string, Ctx> {
  id: Id;
  /** Included in the resolved flow only when this returns true. */
  when: (ctx: Ctx) => boolean;
}

/**
 * Resolves an ordered flow to the ids whose `when` predicate holds for `ctx`.
 * This is the one operation both flows share: "the flow is the steps that apply
 * right now, in order".
 */
export function resolveFlowIds<Id extends string, Ctx>(
  steps: FlowStep<Id, Ctx>[],
  ctx: Ctx,
): Id[] {
  return steps.filter((step) => step.when(ctx)).map((step) => step.id);
}
