import { useTranslation } from "react-i18next";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import { Button, Checkbox, FilePicker, Input } from "@app/ui";
import "@portal/components/pipelines/PipelineHeader.css";

export interface PipelineHeaderProps {
  name: string;
  onNameChange: (name: string) => void;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  /** False for a pipeline that has never been saved: it cannot yet be run, cleared or deleted. */
  isEdit: boolean;

  canSave: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  onBack: () => void;

  /** Run the steps as they stand against one uploaded file, without saving or delivering. */
  onTest: (file: File) => void;
  testing: boolean;
  /** Run the saved pipeline against its real input, delivering to its real destination. */
  onRun: () => void;
  running: boolean;
  onClearHistory: () => void;
  clearingHistory: boolean;
  onDelete: () => void;
}

/**
 * The pipeline's identity and its whole-pipeline actions, at the top of the builder.
 *
 * Split in two so neither half gets lost in a single crowded row: what the pipeline *is* (name,
 * whether it is live) sits with the actions that leave the page, and what you can *do to it* sits
 * below the rule. A test run is part of building, so it lives here rather than off in a corner -
 * its progress shows on the graph's nodes and its results in the inspector.
 */
export function PipelineHeader({
  name,
  onNameChange,
  enabled,
  onEnabledChange,
  isEdit,
  canSave,
  saving,
  onSave,
  onCancel,
  onBack,
  onTest,
  testing,
  onRun,
  running,
  onClearHistory,
  clearingHistory,
  onDelete,
}: PipelineHeaderProps) {
  const { t } = useTranslation();

  return (
    <section className="portal-pipeline-header">
      <div className="portal-pipeline-header__top">
        <Button
          variant="quiet"
          size="sm"
          className="portal-pipeline-header__back"
          onClick={onBack}
          leftSection={
            <ArrowBackRoundedIcon style={{ fontSize: "1.125rem" }} />
          }
        >
          {t("portal.pipelines.builder.back")}
        </Button>
        <div className="portal-pipeline-header__save">
          <Button
            variant="tertiary"
            size="sm"
            onClick={onCancel}
            disabled={saving}
          >
            {t("portal.pipelines.composer.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            loading={saving}
            disabled={!canSave}
          >
            {isEdit
              ? t("portal.pipelines.composer.save")
              : t("portal.pipelines.composer.create")}
          </Button>
        </div>
      </div>

      <div className="portal-pipeline-header__identity">
        <Input
          className="portal-pipeline-header__name"
          value={name}
          placeholder={t("portal.pipelines.composer.namePlaceholder")}
          aria-label={t("portal.pipelines.composer.name")}
          onChange={(e) => onNameChange(e.target.value)}
        />
        {/* A checkbox, not a switch: this is a form value that takes effect on save, and a switch
            would imply it applies the moment it is flipped. No description - a second line beside
            the single-line name field leaves the row ragged. */}
        <Checkbox
          className="portal-pipeline-header__enabled"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          label={t("portal.pipelines.builder.enabled")}
        />
      </div>

      <div className="portal-pipeline-header__actions">
        <FilePicker
          variant="secondary"
          size="sm"
          accept="application/pdf"
          loading={testing}
          onChange={(file) => file && onTest(file)}
          leftSection={<ScienceOutlinedIcon style={{ fontSize: "1.125rem" }} />}
        >
          {t("portal.pipelines.builder.testRun")}
        </FilePicker>

        {isEdit && (
          <>
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
            <Button
              variant="secondary"
              size="sm"
              loading={clearingHistory}
              onClick={onClearHistory}
              leftSection={
                <HistoryRoundedIcon style={{ fontSize: "1.125rem" }} />
              }
            >
              {t("portal.pipelines.detail.clearHistory")}
            </Button>
            <Button
              variant="tertiary"
              size="sm"
              accent="danger"
              className="portal-pipeline-header__delete"
              onClick={onDelete}
              leftSection={
                <DeleteOutlineRoundedIcon style={{ fontSize: "1.125rem" }} />
              }
            >
              {t("portal.pipelines.detail.delete")}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
