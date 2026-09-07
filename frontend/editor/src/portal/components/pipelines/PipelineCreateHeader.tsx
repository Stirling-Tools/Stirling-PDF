import { useTranslation } from "react-i18next";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { ActionIcon, Button, IconPicker, Input } from "@app/ui";
import { PipelineBlockerTooltip } from "@portal/components/pipelines/PipelineBlockerTooltip";
import { PIPELINE_ICON_OPTIONS } from "@portal/components/pipelines/pipelineIcon";
import { EnforceAsPolicyControl } from "@portal/components/pipelines/EnforceAsPolicyControl";
import "@portal/components/pipelines/PipelineCreateHeader.css";

export interface PipelineCreateHeaderProps {
  name: string;
  onNameChange: (name: string) => void;
  /** Row icon key (see pipelineIcon); chosen from the picker beside the name. */
  icon: string;
  onIconChange: (key: string) => void;
  /** "Enforce as policy" toggle, shown in the actions row. */
  required: boolean;
  onRequiredChange: (required: boolean) => void;

  canSave: boolean;
  /** Everything still owed before the pipeline can be created, shown on the disabled create button. */
  blockers: string[];
  saving: boolean;
  /** Which create action is mid-save, so only the button that was clicked shows its spinner. */
  pendingCreateEnabled: boolean | null;
  onCreate: () => void;
  onCreatePaused: () => void;
  onBack: () => void;
}

/**
 * The create-mode toolbar. Mirrors the edit header's shape - a back arrow and the name on the left,
 * actions on the right - so the two modes read as the same page in two states rather than two
 * different screens. The right commits the pipeline live or paused; while it can't yet, the disabled
 * create buttons carry a tooltip listing exactly what is still owed, so "disabled" is never a dead end.
 */
export function PipelineCreateHeader({
  name,
  onNameChange,
  icon,
  onIconChange,
  required,
  onRequiredChange,
  canSave,
  blockers,
  saving,
  pendingCreateEnabled,
  onCreate,
  onCreatePaused,
  onBack,
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

      <IconPicker
        value={icon}
        onChange={onIconChange}
        options={PIPELINE_ICON_OPTIONS}
        ariaLabel={t("portal.pipelines.builder.icon.label")}
      />

      <Input
        className="portal-pipeline-create-header__name"
        value={name}
        placeholder={t("portal.pipelines.composer.namePlaceholder")}
        aria-label={t("portal.pipelines.composer.name")}
        onChange={(e) => onNameChange(e.target.value)}
      />

      <div className="portal-pipeline-create-header__actions">
        <EnforceAsPolicyControl
          required={required}
          onRequiredChange={onRequiredChange}
        />

        {/* The pair share one tooltip target because a disabled button swallows its own hover - the
            wrapper is what the pointer lands on. */}
        <PipelineBlockerTooltip
          heading={t("portal.pipelines.builder.blocker.heading")}
          blockers={blockers}
        >
          <div className="portal-pipeline-create-header__create">
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
        </PipelineBlockerTooltip>
      </div>
    </section>
  );
}
