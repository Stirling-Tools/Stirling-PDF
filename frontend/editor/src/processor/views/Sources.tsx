import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useSearchParams } from "react-router-dom";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { Button, Skeleton } from "@app/ui";
import { useSectionFlags } from "@processor/hooks/useAsync";
import { useSources } from "@processor/queries/sources";
import { type SourceView } from "@processor/api/sources";
import { VIEW_PATHS, toProcessorPath } from "@processor/contexts/ViewContext";
import { KpiStrip } from "@processor/components/sources/KpiStrip";
import { SourcesTable } from "@processor/components/sources/SourcesTable";
import { SourceModal } from "@processor/components/sources/SourceModal";
import { useConnectGate } from "@processor/hooks/useConnectGate";
import "@processor/views/Sources.css";

export function Sources() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { guard, gated, connect } = useConnectGate();

  const state = useSources();
  const { data, loading } = state;
  const { isLoading } = useSectionFlags(state);

  // Create/edit live in a modal on this list; `?new=1` (old /sources/new deep
  // links redirect here with it) opens the create flow on arrival.
  const [modal, setModal] = useState<{
    open: boolean;
    sourceId: string | null;
  }>({ open: false, sourceId: null });

  // Ref so the effect does not loop: it writes the param back, which would re-run it.
  const connectRef = useRef(connect);
  connectRef.current = connect;

  // Sets the modal directly, so it needs the gate in its own right: guarding openCreate would
  // leave ?new=1 as a way past it.
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    if (gated) connectRef.current();
    else setModal({ open: true, sourceId: null });
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, gated]);

  const sources = data?.sources ?? [];

  // The editor is a virtual row that's always present, so "empty" means no
  // configured sources beyond it. Gates the KPI strip.
  const configuredCount = sources.filter((s) => s.type !== "editor").length;
  const showKpis = isLoading || configuredCount > 0;

  // Connecting a source and editing one both need a linked account.
  const openCreate = guard(() => setModal({ open: true, sourceId: null }));
  const openSource = guard((source: SourceView) =>
    setModal({ open: true, sourceId: source.id }),
  );

  // The Connections tab moved to its own Integrations view.
  if (searchParams.get("tab") === "connections") {
    return <Navigate to={toProcessorPath(VIEW_PATHS.integrations)} replace />;
  }

  return (
    <div className="processor-sources">
      <header className="processor-sources__head">
        <div>
          <h1 className="processor-sources__title">
            {t("processor.sources.title")}
          </h1>
          <p className="processor-sources__sub">
            {t("processor.sources.subtitle")}
          </p>
        </div>
        <div className="processor-sources__actions">
          <Button
            fat
            onClick={openCreate}
            leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
          >
            {t("processor.sources.actions.connectSource")}
          </Button>
        </div>
      </header>

      {showKpis && <KpiStrip data={data} loading={loading} />}

      {isLoading && (
        <div className="processor-sources__table-skeleton" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height="3rem" />
          ))}
        </div>
      )}

      {!isLoading && <SourcesTable sources={sources} onRowClick={openSource} />}

      <SourceModal
        open={modal.open}
        sourceId={modal.sourceId}
        onClose={() => setModal({ open: false, sourceId: null })}
      />
    </div>
  );
}
