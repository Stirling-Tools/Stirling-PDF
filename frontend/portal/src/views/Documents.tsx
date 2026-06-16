import { useState } from "react";
import { Tabs, type TabItem } from "@shared/components";
import { DocumentTypeGrid } from "@portal/components/DocumentTypeGrid";
import { ReviewQueue } from "@portal/components/documents/ReviewQueue";
import "@portal/views/Documents.css";

type Surface = "queue" | "catalogue";

const TABS: TabItem<Surface>[] = [
  { key: "queue", label: "Review queue" },
  { key: "catalogue", label: "Catalogue" },
];

/**
 * Documents surface. "Review queue" is the working view — the stream of
 * documents flowing through the org's pipelines awaiting an approval decision.
 * "Catalogue" preserves the full per-vertical document-type endpoint grid.
 */
export function Documents() {
  const [surface, setSurface] = useState<Surface>("queue");

  return (
    <div className="portal-documents">
      <header className="portal-documents__head">
        <h1 className="portal-documents__title">Documents</h1>
        <p className="portal-documents__sub">
          Review and approve documents moving through your pipelines, or browse
          the catalogue of supported document types.
        </p>
      </header>

      <Tabs<Surface>
        items={TABS}
        activeKey={surface}
        onChange={setSurface}
        variant="underline"
        ariaLabel="Documents surface"
      />

      {surface === "queue" ? <ReviewQueue /> : <DocumentTypeGrid />}
    </div>
  );
}
