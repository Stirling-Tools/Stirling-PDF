import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import BlockRoundedIcon from "@mui/icons-material/BlockRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import ContentCutRoundedIcon from "@mui/icons-material/ContentCutRounded";
import { Button } from "@app/ui";
import { useToolRegistry } from "@app/contexts/ToolRegistryContext";
import type { StoreFinding, StoreFindingSeverity } from "@portal/api/store";
import { groupFindings, whereLabel } from "@portal/components/store/storeTools";
import "@portal/components/store/StoreFindings.css";

const ORDER: StoreFindingSeverity[] = ["block", "warn", "info"];

const ICON: Record<StoreFindingSeverity, ReactNode> = {
  block: <BlockRoundedIcon style={{ fontSize: "1rem" }} />,
  warn: <WarningAmberRoundedIcon style={{ fontSize: "1rem" }} />,
  info: <ContentCutRoundedIcon style={{ fontSize: "1rem" }} />,
};

interface StoreFindingsProps {
  findings: StoreFinding[];
}

/**
 * The server's preflight report in three groups: what blocks publishing, what is worth a look, and
 * what was stripped automatically. The server decides all of it; this only lays it out.
 */
export function StoreFindings({ findings }: StoreFindingsProps) {
  const { t } = useTranslation();
  const { allTools } = useToolRegistry();
  const groups = groupFindings(findings);
  const [hidden, setHidden] = useState<Set<StoreFindingSeverity>>(new Set());

  if (findings.length === 0) {
    return (
      <p className="portal-store__findings-none">
        {t("portal.store.findings.none")}
      </p>
    );
  }

  function toggle(severity: StoreFindingSeverity) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(severity)) next.delete(severity);
      else next.add(severity);
      return next;
    });
  }

  return (
    <div className="portal-store__findings">
      {ORDER.map((severity) => {
        const items = groups[severity];
        if (items.length === 0) return null;
        const collapsed = hidden.has(severity);
        return (
          <section
            key={severity}
            className={`portal-store__findings-group portal-store__findings-group--${severity}`}
          >
            <header className="portal-store__findings-head">
              <span className="portal-store__findings-icon" aria-hidden>
                {ICON[severity]}
              </span>
              <h4 className="portal-store__findings-title">
                {t(`portal.store.findings.${severity}.title`)}
                <span className="portal-store__findings-count">
                  {items.length}
                </span>
              </h4>
              <Button
                variant="quiet"
                accent="neutral"
                size="sm"
                onClick={() => toggle(severity)}
                aria-expanded={!collapsed}
              >
                {collapsed
                  ? t("portal.store.findings.show")
                  : t("portal.store.findings.hide")}
              </Button>
            </header>
            {!collapsed && (
              <ul className="portal-store__findings-list">
                {items.map((finding, i) => (
                  <li
                    key={`${finding.code}-${i}`}
                    className="portal-store__finding"
                  >
                    <div className="portal-store__finding-body">
                      <span className="portal-store__finding-title">
                        {finding.title}
                      </span>
                      {finding.detail && (
                        <span className="portal-store__finding-detail">
                          {finding.detail}
                        </span>
                      )}
                    </div>
                    <code className="portal-store__finding-where">
                      {whereLabel(finding.where, allTools, t)}
                    </code>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
