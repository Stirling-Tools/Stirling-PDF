// Type declarations for startupIcons.mjs (plain ESM build helper).

export type StartupIconKind = "lucide" | "stirling" | "brand";

export interface StartupIconSource {
  readonly name: string;
  readonly kind: StartupIconKind;
  readonly specifier: string;
}

export const STARTUP_ICON_SOURCES: readonly StartupIconSource[];

export function iconBody(specifier: string): string;

export function renderStartupIcons(): string;
