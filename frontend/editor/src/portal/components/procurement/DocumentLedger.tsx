import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Chip, Collapsible } from "@shared/components";
import type {
  DealStage,
  JourneyStep,
  LedgerDoc,
  LedgerGroup,
  SupportingGroup,
} from "@portal/api/procurement";
import { DocRow } from "@portal/components/procurement/DocRow";

/**
 * The "Documents" card: every artifact the deal needs, as a stage accordion
 * that mirrors the journey. Only the current stage is open by default; earlier
 * stages read as done, later stages are locked previews. A collapsed-by-default
 * "Supporting your evaluation" pool holds the stage-agnostic paperwork.
 */
export function DocumentLedger({
  groups,
  supporting,
  journey,
  currentStage,
  onAction,
}: {
  groups: LedgerGroup[];
  supporting: SupportingGroup[];
  journey: JourneyStep[];
  currentStage: DealStage;
  onAction: (doc: LedgerDoc) => void;
}) {
  const { t } = useTranslation();
  const order = journey.map((s) => s.stage);
  const curIdx = order.indexOf(currentStage);
  // Follow the deal: the stage you're in opens first; any other stage can be
  // peeked. null collapses them all. Advancing moves the open section along.
  const [openStage, setOpenStage] = useState<DealStage | null>(currentStage);
  const [supportingOpen, setSupportingOpen] = useState(false);
  useEffect(() => setOpenStage(currentStage), [currentStage]);

  return (
    <Card padding="none" className="portal-proc__docs">
      <div className="portal-proc__docs-head">
        <h2 className="portal-proc__docs-title">
          {t("procurement.docs.title")}
        </h2>
        <p className="portal-proc__docs-sub">
          {t("procurement.docs.subtitle")}
        </p>
      </div>

      <div className="portal-proc__docs-body">
        {groups.map((group) => {
          const idx = order.indexOf(group.stage);
          const done = idx < curIdx;
          const cur = group.stage === currentStage;
          const locked = idx > curIdx;
          const blurb = journey.find((s) => s.stage === group.stage)?.blurb;
          const open = openStage === group.stage;
          const count = group.docs.length;

          return (
            <Collapsible
              key={group.stage}
              open={open}
              onToggle={() => setOpenStage(open ? null : group.stage)}
              header={
                <>
                  <span
                    className="portal-proc__stage-dot"
                    data-state={done ? "done" : cur ? "current" : "upcoming"}
                    aria-hidden
                  />
                  <span
                    className="portal-proc__stage-label"
                    data-current={cur || undefined}
                  >
                    {group.label}
                  </span>
                  {blurb && (
                    <span className="portal-proc__stage-hint">· {blurb}</span>
                  )}
                  {cur && (
                    <Chip tone="purple" size="sm">
                      {t("procurement.docs.here")}
                    </Chip>
                  )}
                  {done && (
                    <Chip tone="green" size="sm">
                      {t("procurement.docs.done")}
                    </Chip>
                  )}
                </>
              }
              aside={
                <span className="portal-proc__stage-count">
                  {t("procurement.docs.count", { count })}
                </span>
              }
            >
              <div className="portal-proc__doc-list">
                {group.docs.map((doc) => (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    onAction={onAction}
                    locked={locked}
                  />
                ))}
              </div>
            </Collapsible>
          );
        })}

        {supporting.length > 0 && (
          <Collapsible
            className="portal-proc__supporting-acc"
            open={supportingOpen}
            onToggle={() => setSupportingOpen((o) => !o)}
            header={
              <span className="portal-proc__supporting-head">
                <span className="portal-proc__stage-label">
                  {t("procurement.docs.supportingTitle")}
                </span>
                <span className="portal-proc__supporting-sub">
                  {t("procurement.docs.supportingSubtitle")}
                </span>
              </span>
            }
            aside={
              <span className="portal-proc__acc-toggle-label">
                {supportingOpen
                  ? t("procurement.docs.hide")
                  : t("procurement.docs.show")}
              </span>
            }
          >
            <div className="portal-proc__supporting-groups">
              {supporting.map((group) => (
                <div
                  key={group.category}
                  className="portal-proc__supporting-group"
                >
                  <div className="portal-proc__group-label">{group.label}</div>
                  <div className="portal-proc__doc-list portal-proc__doc-list--boxed">
                    {group.docs.map((doc) => (
                      <DocRow key={doc.id} doc={doc} onAction={onAction} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Collapsible>
        )}
      </div>
    </Card>
  );
}
