import { InfoHint } from "@portal/components/InfoHint";

export interface SectionHeaderProps {
  title: string;
  /** Sub-line under the title. Prefer `hint` for anything explanatory. */
  sub?: string;
  /** Explanation, carried by an info icon beside the title instead of a sub-line. */
  hint?: string;
  /** Accessible name for the hint trigger. Required whenever `hint` is set. */
  hintLabel?: string;
}

/** Title + explanation heading shared by every Infrastructure section. */
export function SectionHeader({
  title,
  sub,
  hint,
  hintLabel,
}: SectionHeaderProps) {
  return (
    <header className="portal-infra__section-head">
      <div className="portal-infra__section-title-row">
        <h2 className="portal-infra__section-title">{title}</h2>
        {hint ? <InfoHint content={hint} label={hintLabel ?? title} /> : null}
      </div>
      {sub ? <p className="portal-infra__section-sub">{sub}</p> : null}
    </header>
  );
}
