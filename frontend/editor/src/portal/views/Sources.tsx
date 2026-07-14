import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { Button, EmptyState, Skeleton, Tabs } from "@app/ui";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import { SourcesIcon } from "@portal/components/icons";
import {
  fetchSources,
  type SourcesResponse,
  type SourceView,
} from "@portal/api/sources";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { AgentBuilderAction } from "@portal/components/sources/AgentBuilderAction";
import { KpiStrip } from "@portal/components/sources/KpiStrip";
import { SourcesTable } from "@portal/components/sources/SourcesTable";
import { ConnectionsTab } from "@portal/components/sources/ConnectionsTab";
import "@portal/views/Sources.css";

type SourcesTab = "sources" | "connections";

export function Sources() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: SourcesTab =
    searchParams.get("tab") === "connections" ? "connections" : "sources";

  const state = useAsync<SourcesResponse>(() => fetchSources(), []);
  const { data, loading } = state;
  const { isLoading } = useSectionFlags(state);

  const sources = data?.sources ?? [];
  // The editor is a virtual row that's always present, so "empty" means no
  // configured sources beyond it. Gates the KPI strip and empty panel.
  const configuredCount = sources.filter((s) => s.type !== "editor").length;
  const showEmpty = !isLoading && configuredCount === 0;

  const openCreate = () => navigate(`${toPortalPath(VIEW_PATHS.sources)}/new`);
  const openSource = (source: SourceView) =>
    navigate(`${toPortalPath(VIEW_PATHS.sources)}/${source.id}`);

  function selectTab(tab: SourcesTab) {
    const next = new URLSearchParams(searchParams);
    if (tab === "sources") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="portal-sources">
      <header className="portal-sources__head">
        <div>
          <h1 className="portal-sources__title">{t("portal.sources.title")}</h1>
          <p className="portal-sources__sub">{t("portal.sources.subtitle")}</p>
        </div>
        {activeTab === "sources" && (
          <div className="portal-sources__actions">
            <AgentBuilderAction />
            <Button
              onClick={openCreate}
              leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
            >
              {t("portal.sources.actions.connectSource")}
            </Button>
          </div>
        )}
      </header>

      <Tabs<SourcesTab>
        variant="underline"
        ariaLabel={t("portal.sources.title")}
        activeKey={activeTab}
        onChange={selectTab}
        items={[
          { key: "sources", label: t("portal.sources.tabs.sources") },
          { key: "connections", label: t("portal.sources.tabs.connections") },
        ]}
      />

      {activeTab === "connections" ? (
        <ConnectionsTab />
      ) : (
        <>
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
                  leftSection={
                    <AddRoundedIcon style={{ fontSize: "1.125rem" }} />
                  }
                >
                  {t("portal.sources.actions.connectSource")}
                </Button>
              }
            />
          )}

          {!isLoading && sources.length > 0 && (
            <SourcesTable sources={sources} onRowClick={openSource} />
          )}
        </>
      )}
    </div>
  );
}
