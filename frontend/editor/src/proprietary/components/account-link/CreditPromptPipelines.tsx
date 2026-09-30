import { useEffect, useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button, ToggleSwitch } from "@app/ui";
import { Icon } from "@app/ui/Icon";
import { Tooltip } from "@app/ui/Tooltip";
import {
  fetchCreditPromptPipelines,
  setCreditPromptPipelineEnabled,
  type CreditPromptPipeline,
} from "@app/services/creditPromptPipelines";
import { pipelineQueryKeys } from "@app/policies/queryKeys";

interface Props {
  onManagePipeline?: (id?: string) => void;
  affectedPipelineId?: string;
}

/** Secondary controls for optional automation; opening the disclosure never changes a pipeline. */
export function CreditPromptPipelines({
  onManagePipeline,
  affectedPipelineId,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pipelines, setPipelines] = useState<CreditPromptPipeline[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<"load" | "save" | null>(null);
  useEffect(() => {
    let active = true;
    fetchCreditPromptPipelines()
      .then((result) => {
        if (!active) return;
        setPipelines(
          [...result.pipelines].sort(
            (a, b) =>
              Number(b.id === affectedPipelineId) -
              Number(a.id === affectedPipelineId),
          ),
        );
        setCanManage(result.canManage);
      })
      .catch(() => {
        if (active) setError("load");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [affectedPipelineId]);

  async function changeEnabled(
    pipeline: CreditPromptPipeline,
    enabled: boolean,
  ) {
    setBusy(pipeline.id);
    setError(null);
    try {
      await setCreditPromptPipelineEnabled(pipeline.id, enabled);
      setPipelines((rows) =>
        rows.map((row) => (row.id === pipeline.id ? { ...row, enabled } : row)),
      );
      void queryClient.invalidateQueries({
        queryKey: pipelineQueryKeys.pipelines(),
      });
      void queryClient.invalidateQueries({
        queryKey: pipelineQueryKeys.policiesList(),
      });
    } catch {
      setError("save");
    } finally {
      setBusy(null);
    }
  }

  function sourceLabel(pipeline: CreditPromptPipeline) {
    const labels = pipeline.sources.map((source) => source.name);
    if (pipeline.editor?.allowed || pipeline.trigger.startsWith("editor-")) {
      labels.unshift(
        pipeline.editor?.runOn === "export" ||
          pipeline.trigger === "editor-export"
          ? t(
              "portal.accountLink.pipelines.editorExport",
              "Editor · before download",
            )
          : t(
              "portal.accountLink.pipelines.editorUpload",
              "Editor · on upload",
            ),
      );
    }
    return (
      labels.join(", ") ||
      t("portal.accountLink.pipelines.manual", "Manual runs")
    );
  }

  return (
    <section className="portal-connect__pipelines">
      <div className="portal-connect__pipeline-header">
        <button
          type="button"
          className="portal-connect__pipeline-disclosure"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((value) => !value)}
        >
          <Icon name={expanded ? "chevron-down" : "chevron-right"} size={14} />
          <span>
            {t("portal.accountLink.pipelines.title", "Active pipelines")}
          </span>
          {!loading && error !== "load" && (
            <span className="portal-connect__pipeline-count">
              {" "}
              {pipelines.filter((pipeline) => pipeline.enabled).length}
            </span>
          )}
        </button>
        {onManagePipeline && (
          <Button
            size="sm"
            px="none"
            variant="quiet"
            accent="neutral"
            onClick={() =>
              onManagePipeline(
                pipelines.length > 5 ? undefined : affectedPipelineId,
              )
            }
          >
            {pipelines.length > 5
              ? t("portal.accountLink.pipelines.viewAll", "View all pipelines")
              : t(
                  "portal.accountLink.failure.manage",
                  "Open pipeline settings",
                )}
          </Button>
        )}
      </div>
      {expanded && (
        <div id={listId} className="portal-connect__pipeline-choices">
          {loading ? (
            <p className="portal-connect__lede">
              {t("portal.accountLink.pipelines.loading", "Loading pipelines…")}
            </p>
          ) : (
            <>
              {!error && pipelines.length === 0 && (
                <p className="portal-connect__lede">
                  {t(
                    "portal.accountLink.pipelines.empty",
                    "No active pipelines.",
                  )}
                </p>
              )}
              <ul className="portal-connect__pipeline-list">
                {pipelines.slice(0, 5).map((pipeline) => (
                  <li key={pipeline.id}>
                    <div className="portal-connect__pipeline-details">
                      <span className="portal-connect__row-label">
                        {pipeline.name}
                        {pipeline.id === affectedPipelineId && (
                          <Tooltip
                            content={t(
                              "portal.accountLink.pipelines.triggered",
                              "Triggered this prompt",
                            )}
                          >
                            <button
                              type="button"
                              className="portal-connect__trigger-info"
                              aria-label={t(
                                "portal.accountLink.pipelines.triggered",
                                "Triggered this prompt",
                              )}
                            >
                              <Icon name="info" size={14} />
                            </button>
                          </Tooltip>
                        )}
                      </span>
                      <span className="portal-connect__pipeline-source">
                        {sourceLabel(pipeline)}

                        {pipeline.required && (
                          <span className="portal-connect__pipeline-note">
                            {t(
                              "portal.accountLink.pipelines.required",
                              "Required policy · manage in pipeline settings",
                            )}
                          </span>
                        )}
                        {!pipeline.enabled && (
                          <span className="portal-connect__pipeline-note">
                            {t("portal.accountLink.pipelines.paused", "Paused")}
                          </span>
                        )}
                      </span>
                    </div>
                    <ToggleSwitch
                      aria-label={pipeline.name}
                      checked={pipeline.enabled}
                      disabled={
                        !canManage || pipeline.required || busy !== null
                      }
                      onChange={(enabled) =>
                        void changeEnabled(pipeline, enabled)
                      }
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
          {error && (
            <p role="alert" className="portal-connect__lede">
              {error === "load"
                ? t(
                    "portal.accountLink.pipelines.loadFailed",
                    "Could not load pipelines. Open pipeline settings to try again.",
                  )
                : t(
                    "portal.accountLink.pipelines.saveFailed",
                    "Could not change this pipeline. Open pipeline settings to review it.",
                  )}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
