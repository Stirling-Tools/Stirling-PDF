import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useSearchParams } from "react-router-dom";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { Button, EmptyState, Skeleton } from "@app/ui";
import { useSectionFlags } from "@portal/hooks/useAsync";
import { useSources } from "@portal/queries/sources";
import { SourcesIcon } from "@portal/components/icons";
import { type SourceView } from "@portal/api/sources";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { KpiStrip } from "@portal/components/sources/KpiStrip";
import { SourcesTable } from "@portal/components/sources/SourcesTable";
import { SourceModal } from "@portal/components/sources/SourceModal";
import "@portal/views/Sources.css";

export function Sources() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const state = useSources();
  const { data, loading } = state;
  const { isLoading } = useSectionFlags(state);

  // Create/edit live in a modal on this list; `?new=1` (old /sources/new deep
  // links redirect here with it) opens the create flow on arrival.
  const [modal, setModal] = useState<{
    open: boolean;
    sourceId: string | null;
  }>({ open: false, sourceId: null });

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setModal({ open: true, sourceId: null });
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const sources = data?.sources ?? [];

  // The editor is a virtual row that's always present, so "empty" means no
  // configured sources beyond it. Gates the KPI strip and empty panel.
  const configuredCount = sources.filter((s) => s.type !== "editor").length;
  const showEmpty = !isLoading && configuredCount === 0;

  const openCreate = () => setModal({ open: true, sourceId: null });
  const openSource = (source: SourceView) =>
    setModal({ open: true, sourceId: source.id });

  // The Connections tab moved to its own Integrations view.
  if (searchParams.get("tab") === "connections") {
    return <Navigate to={toPortalPath(VIEW_PATHS.integrations)} replace />;
  }

  return (
    <div className="portal-sources">
      <header className="portal-sources__head">
        <div>
          <h1 className="portal-sources__title">{t("portal.sources.title")}</h1>
          <p className="portal-sources__sub">{t("portal.sources.subtitle")}</p>
        </div>
        <div className="portal-sources__actions">
          <Button
            onClick={openCreate}
            leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
          >
            {t("portal.sources.actions.connectSource")}
          </Button>
        </div>
      </header>

      {!showEmpty && <KpiStrip data={data} loading={loading} />}

      {isLoading && (
        <div className="portal-sources__table-skeleton" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height="3rem" />
          ))}
        </div>
      )}

      {showEmpty && (
        <EmptyState
          icon={<SourcesIcon size={28} />}
          title={t("portal.sources.empty.title")}
          description={t("portal.sources.empty.description")}
          actions={
            <Button
              onClick={openCreate}
              leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
            >
              {t("portal.sources.actions.connectSource")}
            </Button>
          }
        />
      )}

      {!isLoading && sources.length > 0 && (
        <SourcesTable sources={sources} onRowClick={openSource} />
      )}

      <SourceModal
        open={modal.open}
        sourceId={modal.sourceId}
        onClose={() => setModal({ open: false, sourceId: null })}
      />
    </div>
  );
}
