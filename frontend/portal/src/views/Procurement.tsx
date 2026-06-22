import { useState } from "react";
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
import { ProcurementKpiStrip } from "@portal/components/procurement/ProcurementKpiStrip";
import { DealSummary } from "@portal/components/procurement/DealSummary";
import { DealStepper } from "@portal/components/procurement/DealStepper";
import { DocumentLedger } from "@portal/components/procurement/DocumentLedger";
import { SupportingDocs } from "@portal/components/procurement/SupportingDocs";
import { ActionModal } from "@portal/components/procurement/ActionModal";
import { LockedState } from "@portal/components/procurement/LockedState";
import "@portal/views/Procurement.css";

/**
 * Procurement — the enterprise commercial journey (trial → live) plus the
 * document ledger. Enterprise-only: free/pro buyers see a locked upgrade state.
 */
export function Procurement() {
  const { tier } = useTier();
  const [activeDoc, setActiveDoc] = useState<LedgerDoc | null>(null);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const state = useAsync<ProcurementResponse>(
    () => fetchProcurement(tier),
    [tier],
  );
  const data = state.loading ? null : state.data;

  async function onAdvance(stage: DealStage) {
    setAdvancing(true);
    try {
      await advanceStage(stage);
    } finally {
      setAdvancing(false);
    }
  }

  // Track which row is mid-action so only that button spins; the modal owns
  // the actual stub call and reports back here.
  function onActionDone(doc: LedgerDoc) {
    setBusyDocId(doc.id);
    setActiveDoc(null);
    setBusyDocId(null);
  }

  return (
    <div className="portal-proc">
      <header className="portal-proc__header">
        <div>
          <h1 className="portal-proc__title">From trial to live</h1>
          <p className="portal-proc__subtitle">
            Your commercial journey and every document the deal needs, in one
            place.
          </p>
        </div>
        <StatusBadge tone="purple" size="md">
          Enterprise
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
            // TODO(backend): POST /v1/procurement/sales-contact — for now this
            // is the sidebar's upgrade path; hand off to the account team.
          }}
        />
      )}

      {data && data.unlocked && data.deal && (
        <>
          <ProcurementKpiStrip
            deal={data.deal}
            journey={data.journey}
            ledger={data.ledger}
          />
          <DealSummary deal={data.deal} />
          <DealStepper
            journey={data.journey}
            currentStage={data.deal.currentStage}
            onAdvance={onAdvance}
            advancing={advancing}
          />
          <DocumentLedger
            groups={data.ledger}
            onAction={setActiveDoc}
            busyDocId={busyDocId}
          />
          <SupportingDocs
            groups={data.supporting}
            onAction={setActiveDoc}
            busyDocId={busyDocId}
          />
        </>
      )}

      <ActionModal
        doc={activeDoc}
        onClose={() => setActiveDoc(null)}
        onDone={onActionDone}
      />
    </div>
  );
}
