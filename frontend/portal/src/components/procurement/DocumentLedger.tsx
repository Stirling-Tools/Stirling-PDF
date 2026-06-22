import { Card } from "@shared/components";
import type { LedgerDoc, LedgerGroup } from "@portal/api/procurement";
import { SectionHeader } from "@portal/components/procurement/SectionHeader";
import { DocRow } from "@portal/components/procurement/DocRow";

/**
 * The deal's paperwork grouped by the journey stage it belongs to — each stage
 * is a card of document rows. This is the "what do I need to hand over and
 * when" ledger that rides alongside the stepper.
 */
export function DocumentLedger({
  groups,
  onAction,
  busyDocId,
}: {
  groups: LedgerGroup[];
  onAction: (doc: LedgerDoc) => void;
  busyDocId?: string | null;
}) {
  return (
    <section className="portal-proc__ledger">
      <SectionHeader
        title="Document ledger"
        sub="Every document this deal needs, grouped by the stage it belongs to."
      />
      <div className="portal-proc__ledger-groups">
        {groups.map((group) => (
          <Card key={group.stage} padding="none">
            <div className="portal-proc__group-head">
              <span className="portal-proc__group-label">{group.label}</span>
            </div>
            <div className="portal-proc__group-docs">
              {group.docs.map((doc) => (
                <DocRow
                  key={doc.id}
                  doc={doc}
                  onAction={onAction}
                  busy={busyDocId === doc.id}
                />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
