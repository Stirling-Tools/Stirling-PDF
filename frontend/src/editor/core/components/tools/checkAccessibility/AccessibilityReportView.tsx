import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@editor/ui/Card";
import type { IconName } from "@editor/ui/Icon";
import { SectionHeader } from "@editor/ui/SectionHeader";
import { ChecksRing } from "@editor/components/tools/checkAccessibility/ChecksRing";
import { AccessibilityAreaItem } from "@editor/components/tools/checkAccessibility/AccessibilityAreaItem";
import { BreakdownRow } from "@editor/components/tools/checkAccessibility/AccessibilityBreakdownRow";
import { AccessibilityManualChecks } from "@editor/components/tools/checkAccessibility/AccessibilityManualChecks";
import {
  basicLabel,
  basicTip,
  checksLabel,
  figuresSummary,
  resultLabel,
  resultSummary,
} from "@editor/utils/accessibilityReportContent";
import type { AccessibilityReport } from "@editor/types/checkAccessibility";
import {
  assessAccessibilityReport,
  type AccessibilityBasicId,
} from "@editor/utils/accessibilityAssessment";

const BASIC_ICON: Record<AccessibilityBasicId, IconName> = {
  tagged: "tags",
  title: "file-pen",
  displaysTitle: "eye",
  language: "globe",
  fonts: "type",
  declares: "shield-check",
  notEncrypted: "lock-open",
};

interface AccessibilityReportViewProps {
  report: AccessibilityReport;
  /** Indexes into `report.humanChecks` the user has ticked. */
  manualTicked: ReadonlySet<number>;
  onToggleManual: (index: number) => void;
  onSetAllManual: (done: boolean) => void;
}

export function AccessibilityReportView({
  report,
  manualTicked,
  onToggleManual,
  onSetAllManual,
}: AccessibilityReportViewProps) {
  const { t } = useTranslation();
  const { result, areas, basics, checks } = useMemo(
    () => assessAccessibilityReport(report),
    [report],
  );
  const figures = figuresSummary(t, report);

  return (
    <div className="a11y-report" data-testid="a11y-report">
      <Card padding="default" className="a11y-hero">
        <ChecksRing
          passed={checks.passed}
          total={checks.total}
          result={result}
          label={checksLabel(t, checks)}
        />
        <div className="a11y-hero__text">
          <span className={`a11y-hero__result a11y-result--${result}`}>
            {resultLabel(t, result)}
          </span>
          <span className="a11y-hero__summary">{resultSummary(t, result)}</span>
          <span className="a11y-hero__sub">
            {t(
              "checkAccessibility.score.subtitle",
              "{{profile}} - {{count}} pages",
              { profile: report.profile, count: report.summary.pages },
            )}
            {" - "}
            {report.issues.length === 0
              ? t("checkAccessibility.score.noIssues", "No issues found")
              : t("checkAccessibility.score.issues", "{{count}} issues", {
                  count: report.issues.length,
                })}
          </span>
        </div>
      </Card>

      <section className="a11y-section">
        <SectionHeader
          title={t("checkAccessibility.sections.breakdown", "Breakdown")}
        />
        <ul className="a11y-breakdown">
          {areas.map((area) => (
            <AccessibilityAreaItem
              key={area.id}
              area={area}
              note={area.id === "altText" ? figures : null}
            />
          ))}
          {basics.map((basic) => (
            <li key={basic.id} className="a11y-area">
              <BreakdownRow
                icon={BASIC_ICON[basic.id]}
                label={basicLabel(t, basic.id)}
                tip={basicTip(t, basic.id)}
                status={basic.ok ? "pass" : "fail"}
              />
            </li>
          ))}
          {report.humanChecks.length > 0 && (
            <AccessibilityManualChecks
              checks={report.humanChecks}
              ticked={manualTicked}
              onToggle={onToggleManual}
              onSetAll={onSetAllManual}
            />
          )}
        </ul>
      </section>
    </div>
  );
}
