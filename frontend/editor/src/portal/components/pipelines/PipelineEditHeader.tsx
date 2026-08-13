import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PowerSettingsNewRoundedIcon from "@mui/icons-material/PowerSettingsNewRounded";
import CodeRoundedIcon from "@mui/icons-material/CodeRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import { ActionIcon, Button, Dropdown, Input } from "@app/ui";
import { PipelineBlockerTooltip } from "@portal/components/pipelines/PipelineBlockerTooltip";
import "@portal/components/pipelines/PipelineEditHeader.css";

export interface PipelineEditHeaderProps {
  name: string;
  onNameChange: (name: string) => void;

  /** The pipeline's live state. Toggling it takes effect immediately, not on save. */
  enabled: boolean;
  onTogglePause: () => void;
  togglingEnabled: boolean;

  onBack: () => void;

  canSave: boolean;
  /** Everything still owed before the edits can be saved, shown on the disabled Save button. */
  blockers: string[];
  saving: boolean;
  onSave: () => void;

  /** Run the saved pipeline against its real input, delivering to its real destination. */
  onRun: () => void;
  running: boolean;
  onClearHistory: () => void;
  clearingHistory: boolean;
  onDelete: () => void;
  onViewDefinition: () => void;
}

/**
 * Edit mode's toolbar over an existing, live pipeline. The left is what it *is* - a back arrow, its
 * name as the page title, a pencil to rename in place. The right is what you can *do to it*: pause
 * or activate it (an operational toggle that acts at once, matching the Policies vocabulary), run it
 * now, read its definition, and - behind an overflow, since they are rare or destructive - clear its
 * processed history or delete it. Saving the chain edits is the primary action, on the far right.
 */
export function PipelineEditHeader({
  name,
  onNameChange,
  enabled,
  onTogglePause,
  togglingEnabled,
  onBack,
  canSave,
  blockers,
  saving,
  onSave,
  onRun,
  running,
  onClearHistory,
  clearingHistory,
  onDelete,
  onViewDefinition,
}: PipelineEditHeaderProps) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  function startRename() {
    setDraft(name);
    setRenaming(true);
  }

  // Commit an edited name only if it is non-empty; an all-whitespace rename would leave the pipeline
  // titleless. Escape (handled below) exits without touching the name at all.
  function commitRename() {
    const next = draft.trim();
    if (next) onNameChange(next);
    setRenaming(false);
  }

  return (
    <section className="portal-pipeline-edit-header">
      <div className="portal-pipeline-edit-header__identity">
        <ActionIcon
          variant="quiet"
          size="sm"
          onClick={onBack}
          aria-label={t("portal.pipelines.builder.back")}
        >
          <ArrowBackRoundedIcon style={{ fontSize: "1.25rem" }} />
        </ActionIcon>

        {renaming ? (
          <Input
            ref={inputRef}
            className="portal-pipeline-edit-header__name-input"
            value={draft}
            aria-label={t("portal.pipelines.composer.name")}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <>
            <h1 className="portal-pipeline-edit-header__title">{name}</h1>
            <ActionIcon
              variant="quiet"
              size="sm"
              onClick={startRename}
              aria-label={t("portal.pipelines.builder.rename")}
            >
              <EditOutlinedIcon style={{ fontSize: "1rem" }} />
            </ActionIcon>
          </>
        )}
      </div>

      <div className="portal-pipeline-edit-header__actions">
        <Button
          variant="secondary"
          size="sm"
          loading={togglingEnabled}
          onClick={onTogglePause}
          leftSection={
            enabled ? (
              <PauseRoundedIcon style={{ fontSize: "1.125rem" }} />
            ) : (
              <PowerSettingsNewRoundedIcon style={{ fontSize: "1.125rem" }} />
            )
          }
        >
          {enabled
            ? t("portal.pipelines.builder.pause")
            : t("portal.pipelines.builder.activate")}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          loading={running}
          onClick={onRun}
          leftSection={
            <PlayArrowRoundedIcon style={{ fontSize: "1.125rem" }} />
          }
        >
          {t("portal.pipelines.detail.run")}
        </Button>

        <Tooltip
          label={t("portal.pipelines.builder.viewDefinition")}
          position="bottom"
          withinPortal
        >
          <ActionIcon
            variant="tertiary"
            size="sm"
            onClick={onViewDefinition}
            aria-label={t("portal.pipelines.builder.viewDefinition")}
          >
            <CodeRoundedIcon style={{ fontSize: "1.125rem" }} />
          </ActionIcon>
        </Tooltip>

        {/* Rare and destructive actions kept off the row so they do not compete with running. */}
        <Dropdown.Root align="end">
          <Dropdown.Trigger>
            <ActionIcon
              variant="tertiary"
              size="sm"
              aria-label={t("portal.pipelines.builder.moreActions")}
            >
              <MoreHorizRoundedIcon style={{ fontSize: "1.125rem" }} />
            </ActionIcon>
          </Dropdown.Trigger>
          <Dropdown.Menu>
            <Dropdown.Item
              onSelect={onClearHistory}
              disabled={clearingHistory}
              leading={<HistoryRoundedIcon style={{ fontSize: "1.125rem" }} />}
            >
              {t("portal.pipelines.detail.clearHistory")}
            </Dropdown.Item>
            <Dropdown.Divider />
            <Dropdown.Item
              onSelect={onDelete}
              className="portal-pipeline-edit-header__delete-item"
              leading={
                <DeleteOutlineRoundedIcon style={{ fontSize: "1.125rem" }} />
              }
            >
              {t("portal.pipelines.detail.delete")}
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Root>

        {/* Wrapped in a span so the disabled button's hover still reaches the tooltip. */}
        <PipelineBlockerTooltip
          heading={t("portal.pipelines.builder.blocker.saveHeading")}
          blockers={blockers}
        >
          <span className="portal-pipeline-edit-header__save">
            <Button
              size="sm"
              onClick={onSave}
              loading={saving}
              disabled={!canSave}
            >
              {t("portal.pipelines.composer.save")}
            </Button>
          </span>
        </PipelineBlockerTooltip>
      </div>
    </section>
  );
}
