import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Skeleton, StatusBadge } from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { useAsync } from "@portal/hooks/useAsync";
import {
  advanceStage,
  fetchProcurement,
  type DealStage,
  type LedgerDoc,
  type ProcurementResponse,
} from "@portal/api/procurement";
import { DealJourney } from "@portal/components/procurement/DealJourney";
import { DocumentLedger } from "@portal/components/procurement/DocumentLedger";
import { ActionModal } from "@portal/components/procurement/ActionModal";
import { LockedState } from "@portal/components/procurement/LockedState";
import "@portal/views/Procurement.css";

/**
 * Procurement: the enterprise commercial journey (trial to live) plus the
 * document ledger. Enterprise-only: free/pro buyers see a locked upgrade state.
 */
export function Procurement() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const [activeDoc, setActiveDoc] = useState<LedgerDoc | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const state = useAsync<ProcurementResponse>(
    () => fetchProcurement(tier),
    [tier],
  );

  // Write actions return the new canonical state; we hold it here so the
  // journey reflects every action immediately. Cleared when the tier (and so
  // the deal) changes, falling back to whatever the GET loaded.
  const [applied, setApplied] = useState<ProcurementResponse | null>(null);
  useEffect(() => setApplied(null), [tier]);
  const data = applied ?? (state.loading ? null : state.data);

  async function onAdvance(stage: DealStage) {
    setAdvancing(true);
    try {
      setApplied(await advanceStage(stage));
    } finally {
      setAdvancing(false);
    }
  }

  return (
    <div className="portal-proc">
      <header className="portal-proc__header">
        <div>
          <h1 className="portal-proc__title">{t("procurement.title")}</h1>
          <p className="portal-proc__subtitle">{t("procurement.subtitle")}</p>
        </div>
        <StatusBadge tone="purple" size="md">
          {t("procurement.enterpriseBadge")}
        </StatusBadge>
      </header>

      {state.loading && (
        <Card padding="loose">
          <Skeleton width="12rem" height="1.25rem" />
          <Skeleton height="8rem" />
        </Card>
      )}

      {data && !data.unlocked && (
        <LockedState
          journey={data.journey}
          onTalkToSales={() => {
            // TODO(backend): POST /v1/procurement/sales-contact, for now this
            // is the sidebar's upgrade path; hand off to the account team.
          }}
        />
      )}

      {data && data.unlocked && data.deal && (
        <>
          <DealJourney
            deal={data.deal}
            journey={data.journey}
            onAdvance={onAdvance}
            advancing={advancing}
          />
          <DocumentLedger
            groups={data.ledger}
            supporting={data.supporting}
            journey={data.journey}
            currentStage={data.deal.currentStage}
            onAction={setActiveDoc}
          />
        </>
      )}

      <ActionModal
        doc={activeDoc}
        onClose={() => setActiveDoc(null)}
        onDone={(next) => {
          setApplied(next);
          setActiveDoc(null);
        }}
      />
    </div>
  );
}
