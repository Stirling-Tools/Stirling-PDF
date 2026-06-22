import { Card } from "@shared/components";
import type { LedgerDoc, SupportingGroup } from "@portal/api/procurement";
import { SectionHeader } from "@portal/components/procurement/SectionHeader";
import { DocRow } from "@portal/components/procurement/DocRow";

/**
 * Stage-agnostic supporting documents — security attestations, legal forms,
 * corporate records, procurement onboarding — grouped by category. These can be
 * requested at any point in the journey, independent of the current stage.
 */
export function SupportingDocs({
  groups,
  onAction,
  busyDocId,
}: {
  groups: SupportingGroup[];
  onAction: (doc: LedgerDoc) => void;
  busyDocId?: string | null;
}) {
  return (
    <section className="portal-proc__supporting">
      <SectionHeader
        title="Supporting documents"
        sub="Security, legal, corporate and procurement paperwork — available any time."
      />
      <div className="portal-proc__supporting-groups">
        {groups.map((group) => (
          <Card key={group.category} padding="none">
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
