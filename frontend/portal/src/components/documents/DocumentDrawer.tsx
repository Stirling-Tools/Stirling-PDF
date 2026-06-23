import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Drawer, StatusBadge, Tabs, type TabItem } from "@shared/components";
import {
  DOCUMENT_STATUS_LABEL,
  DOCUMENT_STATUS_TONE,
  type ReviewDocument,
} from "@portal/api/documents";
import { useTier } from "@portal/contexts/TierContext";
import { ELEVATION_WINDOW_SECONDS } from "@portal/components/documents/format";
import { DocumentOverview } from "@portal/components/documents/DocumentOverview";
import { DocumentExtractions } from "@portal/components/documents/DocumentExtractions";
import { DocumentAudit } from "@portal/components/documents/DocumentAudit";
import { ElevationBanner } from "@portal/components/documents/ElevationBanner";

type SubTab = "overview" | "extractions" | "audit";

interface DocumentDrawerProps {
  /** Selected document, or null when the drawer is closed. */
  doc: ReviewDocument | null;
  onClose: () => void;
}

/**
 * Detail panel for a queued document. Sub-tabs split overview, extracted
 * fields, and the audit timeline. Sensitive documents gate their content
 * behind a client-side timed elevation; enterprise adds a four-eyes note.
 */
export function DocumentDrawer({ doc, onClose }: DocumentDrawerProps) {
  const { t } = useTranslation();
  const { tier } = useTier();
  const fourEyes = tier === "enterprise";

  const subTabs: TabItem<SubTab>[] = [
    { key: "overview", label: t("documents.drawer.tabs.overview") },
    { key: "extractions", label: t("documents.drawer.tabs.extractions") },
    { key: "audit", label: t("documents.drawer.tabs.audit") },
  ];

  const [tab, setTab] = useState<SubTab>("overview");
  // Seconds remaining on the active elevation grant; null means no grant.
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // Reset tab and any active grant whenever a different document opens — a
  // grant is scoped to the document it was requested for.
  useEffect(() => {
    setTab("overview");
    setSecondsLeft(null);
  }, [doc?.id]);

  // Tick the countdown down to expiry, then drop the grant.
  useEffect(() => {
    if (secondsLeft === null) return;
    if (secondsLeft <= 0) {
      setSecondsLeft(null);
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => (s ?? 1) - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  if (!doc) return null;

  function requestAccess() {
    // TODO(backend): POST /v1/documents/{id}/elevation — request a time-boxed
    // grant (and, on enterprise, trigger the four-eyes peer notification).
    // The grant + countdown are simulated client-side until that exists.
    setSecondsLeft(ELEVATION_WINDOW_SECONDS);
  }

  const unlocked = secondsLeft !== null;

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={doc.name}
      subtitle={`${doc.type} · ${doc.source}`}
    >
      <div className="portal-documents__drawer">
        <div className="portal-documents__drawer-status">
          <StatusBadge tone={DOCUMENT_STATUS_TONE[doc.status]} size="sm">
            {DOCUMENT_STATUS_LABEL[doc.status]}
          </StatusBadge>
        </div>

        {doc.sensitive && (
          <ElevationBanner
            secondsLeft={secondsLeft}
            fourEyes={fourEyes}
            onRequest={requestAccess}
          />
        )}

        <Tabs<SubTab>
          items={subTabs}
          activeKey={tab}
          onChange={setTab}
          variant="underline"
          ariaLabel={t("documents.drawer.sectionsAriaLabel")}
        />

        <div className="portal-documents__drawer-panel">
          {tab === "overview" && <DocumentOverview doc={doc} />}
          {tab === "extractions" && (
            <DocumentExtractions doc={doc} unlocked={unlocked} />
          )}
          {tab === "audit" && <DocumentAudit doc={doc} />}
        </div>
      </div>
    </Drawer>
  );
}
