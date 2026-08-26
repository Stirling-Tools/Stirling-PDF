import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import { Button, ToggleSwitch } from "@app/ui";

export interface PipelinePolicyControlsProps {
  /** Org-mandated policy (see Policy.required). */
  required: boolean;
  onRequiredChange: (required: boolean) => void;
  /**
   * Return to the simple wizard. Present only while the pipeline still fits its template (so nothing
   * would be lost); omitted otherwise.
   */
  onBackToSimple?: () => void;
}

/**
 * The pipeline-level policy controls that sit in the builder header alongside the primary actions:
 * the "Enforce as policy" switch (its rule lives in a tooltip, not inline), and - when the chain is
 * still template-shaped - a way back to the simple view.
 */
export function PipelinePolicyControls({
  required,
  onRequiredChange,
  onBackToSimple,
}: PipelinePolicyControlsProps) {
  const { t } = useTranslation();
  return (
    <>
      {onBackToSimple && (
        <Button
          variant="tertiary"
          size="sm"
          onClick={onBackToSimple}
          leftSection={<UndoRoundedIcon style={{ fontSize: "1.05rem" }} />}
        >
          {t("portal.pipelines.builder.backToSimple")}
        </Button>
      )}
      <Tooltip
        label={t("portal.pipelines.builder.required.desc")}
        position="bottom-end"
        withinPortal
        multiline
        w={260}
      >
        {/* Span wrapper so the tooltip has a ref-able hover target around the switch. */}
        <span>
          <ToggleSwitch
            size="sm"
            checked={required}
            onChange={onRequiredChange}
            label={t("portal.pipelines.builder.required.label")}
          />
        </span>
      </Tooltip>
    </>
  );
}
