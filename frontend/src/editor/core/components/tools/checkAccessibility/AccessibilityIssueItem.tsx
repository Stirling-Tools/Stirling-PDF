import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Collapsible } from "@editor/ui/Collapsible";
import { DataRow } from "@editor/ui/DataRow";
import type { AccessibilityIssue } from "@editor/types/checkAccessibility";
import { describeIssue } from "@editor/utils/accessibilityReportContent";

const LABEL_WIDTH = "6rem";

interface AccessibilityIssueItemProps {
  issue: AccessibilityIssue;
}

export function AccessibilityIssueItem({ issue }: AccessibilityIssueItemProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const { title, summary, explanation, details } = describeIssue(t, issue);

  return (
    <div className="a11y-issue" data-testid="a11y-issue">
      <Collapsible
        open={open}
        onToggle={() => setOpen((value) => !value)}
        header={
          <span className="a11y-issue__head">
            <span className="a11y-issue__title">{title}</span>
            <span className="a11y-issue__meta">{summary}</span>
          </span>
        }
      >
        <div className="a11y-issue__body">
          {explanation && <p className="a11y-issue__rule">{explanation}</p>}
          <Collapsible
            open={showDetails}
            onToggle={() => setShowDetails((value) => !value)}
            header={t("checkAccessibility.issue.details", "Details")}
          >
            <div className="a11y-issue__technical">
              {details.map((detail) => (
                <DataRow
                  key={detail.label}
                  label={detail.label}
                  labelWidth={LABEL_WIDTH}
                  align="top"
                >
                  {detail.value}
                </DataRow>
              ))}
            </div>
          </Collapsible>
        </div>
      </Collapsible>
    </div>
  );
}
