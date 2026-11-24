import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Checkbox } from "@editor/ui/Checkbox";
import { SectionHeader } from "@editor/ui/SectionHeader";

interface AccessibilityManualChecksProps {
  checks: string[];
  /** Indexes into `checks` the user has ticked. */
  ticked: ReadonlySet<number>;
  onToggle: (index: number) => void;
  /** Ticks every check, or clears them all when `done` is false. */
  onSetAll: (done: boolean) => void;
}

/** The checks only a person can make; the ticks go into the downloaded report. */
export function AccessibilityManualChecks({
  checks,
  ticked,
  onToggle,
  onSetAll,
}: AccessibilityManualChecksProps) {
  const { t } = useTranslation();
  const allDone = ticked.size === checks.length;
  return (
    <section className="a11y-section" data-testid="a11y-manual-checks">
      <SectionHeader
        title={t("checkAccessibility.manual.title", "Manual checks")}
        count={`${ticked.size}/${checks.length}`}
      />
      <p className="a11y-note">
        {t(
          "checkAccessibility.manual.tip",
          "Things only a person can judge, such as reading order and whether image descriptions make sense. Tick each one once you've checked it, and your ticks go into the downloaded report.",
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
      <Button
        className="a11y-manual__all"
        variant="secondary"
        size="sm"
        onClick={() => onSetAll(!allDone)}
      >
        {allDone
          ? t("checkAccessibility.manual.clearAll", "Clear all")
          : t("checkAccessibility.manual.markAllDone", "Mark all as done")}
      </Button>
    </section>
  );
}
