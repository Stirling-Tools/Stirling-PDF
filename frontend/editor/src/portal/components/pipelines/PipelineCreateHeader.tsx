import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CodeRoundedIcon from "@mui/icons-material/CodeRounded";
import { ActionIcon, Button, Input } from "@app/ui";
import "@portal/components/pipelines/PipelineCreateHeader.css";

export interface PipelineCreateHeaderProps {
  name: string;
  onNameChange: (name: string) => void;

  canSave: boolean;
  saving: boolean;
  /** Which create action is mid-save, so only the button that was clicked shows its spinner. */
  pendingCreateEnabled: boolean | null;
  onCreate: () => void;
  onCreatePaused: () => void;
  onBack: () => void;

  /** Opens the definition (JSON + cURL). Rarely used, so it is an icon, not a labelled button. */
  onViewDefinition: () => void;
}

/**
 * The create-mode toolbar. Mirrors the edit header's shape - a back arrow and the name on the left,
 * actions on the right - so the two modes read as the same page in two states rather than two
 * different screens. The right commits the pipeline live or paused; the create buttons disable until
 * it is valid, so a click always does something.
 */
export function PipelineCreateHeader({
  name,
  onNameChange,
  canSave,
  saving,
  pendingCreateEnabled,
  onCreate,
  onCreatePaused,
  onBack,
  onViewDefinition,
}: PipelineCreateHeaderProps) {
  const { t } = useTranslation();

  return (
    <section className="portal-pipeline-create-header">
      <ActionIcon
        variant="quiet"
        size="sm"
        onClick={onBack}
        aria-label={t("portal.pipelines.builder.back")}
      >
        <ArrowBackRoundedIcon style={{ fontSize: "1.25rem" }} />
      </ActionIcon>

      <Input
        className="portal-pipeline-create-header__name"
        value={name}
        placeholder={t("portal.pipelines.composer.namePlaceholder")}
        aria-label={t("portal.pipelines.composer.name")}
        onChange={(e) => onNameChange(e.target.value)}
      />

      <div className="portal-pipeline-create-header__actions">
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

        <Button
          variant="secondary"
          size="sm"
          loading={saving && pendingCreateEnabled === false}
          disabled={!canSave}
          onClick={onCreatePaused}
        >
          {t("portal.pipelines.composer.createPaused")}
        </Button>
        <Button
          size="sm"
          loading={saving && pendingCreateEnabled === true}
          disabled={!canSave}
          onClick={onCreate}
        >
          {t("portal.pipelines.composer.create")}
        </Button>
      </div>
    </section>
  );
}
