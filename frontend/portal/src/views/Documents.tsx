import { DocumentTypeGrid } from "@portal/components/DocumentTypeGrid";
import "@portal/views/Documents.css";

/**
 * Full document-type catalogue — the exhaustive per-vertical endpoint list.
 * Home only teases four use cases (see PopularUseCases); the complete,
 * tab-filterable grid lives here on its own surface.
 */
export function Documents() {
  return (
    <div className="portal-documents">
      <DocumentTypeGrid />
    </div>
  );
}
