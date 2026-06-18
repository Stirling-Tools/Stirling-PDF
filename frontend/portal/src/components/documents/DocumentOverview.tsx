import { StatTile } from "@shared/components";
import {
  DOCUMENT_STATUS_LABEL,
  type ReviewDocument,
} from "@portal/api/documents";
import { confidencePct } from "@portal/components/documents/format";

/** Key fields for the selected document — status, source, confidence. */
export function DocumentOverview({ doc }: { doc: ReviewDocument }) {
  return (
    <div className="portal-documents__overview">
      <div className="portal-documents__stat-grid">
        <StatTile label="Status" value={DOCUMENT_STATUS_LABEL[doc.status]} />
        <StatTile label="Type" value={doc.type} />
        <StatTile label="Confidence" value={confidencePct(doc.confidence)} />
        <StatTile label="Fields extracted" value={doc.fieldsExtracted} />
        <StatTile label="Source" value={doc.source} />
        <StatTile label="Received" value={doc.time} />
      </div>
    </div>
  );
}
