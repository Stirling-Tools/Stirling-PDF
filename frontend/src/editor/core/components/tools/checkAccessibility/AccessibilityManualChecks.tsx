import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@editor/ui/Checkbox";
import { SectionHeader } from "@editor/ui/SectionHeader";

interface AccessibilityManualChecksProps {
  checks: string[];
  /** Indexes into `checks` the user has ticked. */
  ticked: ReadonlySet<number>;
  onToggle: (index: number) => void;
}

/** The checks a person has to make, as a checklist whose ticks go into the downloaded report. */
export function AccessibilityManualChecks({
  checks,
  ticked,
  onToggle,
}: AccessibilityManualChecksProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="a11y-section">
      <SectionHeader
        title={t(
          "checkAccessibility.sections.limits",
          "What this tool can't check",
        )}
        count={t(
          "checkAccessibility.manual.count",
          "{{ticked}} of {{total}} done",
          { ticked: ticked.size, total: checks.length },
        )}
        collapsible
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
      />
      {expanded && (
        <>
          <p className="a11y-note">
            {t(
              "checkAccessibility.manual.hint",
              "Tick each one once you've checked it yourself. Your ticks are included in the downloaded report.",
            )}
          </p>
          <ul className="a11y-manual">
            {checks.map((check, index) => (
              <li key={check}>
                <Checkbox
                  label={check}
                  checked={ticked.has(index)}
                  onChange={() => onToggle(index)}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
