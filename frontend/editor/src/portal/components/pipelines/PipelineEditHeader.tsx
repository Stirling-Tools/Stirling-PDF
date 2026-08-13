import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PowerSettingsNewRoundedIcon from "@mui/icons-material/PowerSettingsNewRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
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
  /** Reprocess everything in the sources: clears the processed record, then runs at once. */
  onReprocess: () => void;
  reprocessing: boolean;
  onDelete: () => void;
}

/**
 * Edit mode's toolbar over an existing, live pipeline. The left is what it *is* - a back arrow, its
 * name as the page title, a pencil to rename in place. The right is what you can *do to it*: pause
 * or activate it (an operational toggle that acts at once, matching the Policies vocabulary), run it
 * now, and - behind an overflow, since they are rare or destructive - reprocess its sources or delete
 * it. Saving the chain edits is the primary action, on the far right. (Reading the definition is an
 * inspect action, so it lives in the graph toolbar beside Test, not here.)
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
  onReprocess,
  reprocessing,
  onDelete,
}: PipelineEditHeaderProps) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  // Enter and Escape both end the rename, which unmounts the input - and unmounting a focused input
  // fires blur in a real browser (jsdom does not). Without this guard that blur would re-run the
  // commit, so Escape would save the very draft it was meant to discard. The key handler sets this so
  // the trailing blur is ignored; a plain click-away leaves it false and blur commits as normal.
  const keyHandledRef = useRef(false);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  function startRename() {
    keyHandledRef.current = false;
    setDraft(name);
    setRenaming(true);
  }

  // End the rename, committing the draft only when asked and only if non-empty (an all-whitespace
  // rename would leave the pipeline titleless).
  function finishRename(commit: boolean) {
    keyHandledRef.current = true;
    if (commit) {
      const next = draft.trim();
      if (next) onNameChange(next);
    }
    setRenaming(false);
  }

  // Clicking away commits; the unmount-triggered blur that follows a key press does not (the key
  // already decided the outcome).
  function handleBlur() {
    if (keyHandledRef.current) {
      keyHandledRef.current = false;
      return;
    }
    finishRename(true);
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
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") finishRename(true);
              if (e.key === "Escape") finishRename(false);
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
        {/* Pause and Save both write the whole policy, so they are mutually exclusive: neither can
            start while the other is committing, or the two writes race and the loser's version wins. */}
        <Button
          variant="secondary"
          size="sm"
          loading={togglingEnabled}
          disabled={saving}
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
              onSelect={onReprocess}
              disabled={reprocessing}
              leading={<ReplayRoundedIcon style={{ fontSize: "1.125rem" }} />}
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
              disabled={!canSave || togglingEnabled}
            >
              {t("portal.pipelines.composer.save")}
            </Button>
          </span>
        </PipelineBlockerTooltip>
      </div>
    </section>
  );
}
