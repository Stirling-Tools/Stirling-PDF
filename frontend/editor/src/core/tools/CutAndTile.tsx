import { Radio, Stack } from "@mantine/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { ChoiceRow } from "@app/components/shared/ChoiceRow";
import CutAndTileSettings from "@app/components/tools/cutAndTile/CutAndTileSettings";
import { CutAndTilePreview } from "@app/components/tools/cutAndTile/CutAndTilePreview";
import {
  CutAndTileSummary,
  cutAndTileBlocksRun,
} from "@app/components/tools/cutAndTile/CutAndTileSummary";
import { computeCutAndTileOutcome } from "@app/components/tools/cutAndTile/cutAndTileOutcome";
import { CUT_AND_TILE_MODES } from "@app/components/tools/cutAndTile/cutAndTileConstants";
import {
  useCutAndTileParameters,
  type CutAndTileMode,
} from "@app/hooks/tools/cutAndTile/useCutAndTileParameters";
import { useCutAndTileOperation } from "@app/hooks/tools/cutAndTile/useCutAndTileOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { useStirlingFileStub } from "@app/contexts/file/fileHooks";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import type { FileId } from "@app/types/fileContext";

/** Stand-in id for "no file selected", so the stub lookup hook is always called. */
const NO_FILE_ID = "" as FileId;

const CutAndTile = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "cutAndTile",
    useCutAndTileParameters,
    useCutAndTileOperation,
    props,
  );

  const parameters = base.params.parameters;

  const { record } = useStirlingFileStub(
    base.selectedFiles[0]?.fileId ?? NO_FILE_ID,
  );
  const totalPages = record?.processedFile?.totalPages ?? null;

  const outcome = useMemo(
    () => computeCutAndTileOutcome(parameters, totalPages),
    [parameters, totalPages],
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("cutAndTile.steps.how", "How to cut"),
        content: (
          <Stack gap="md">
            <Radio.Group
              value={parameters.mode}
              onChange={(next) =>
                base.params.updateParameter("mode", next as CutAndTileMode)
              }
              aria-label={t("cutAndTile.mode.groupLabel", "How to cut")}
            >
              <Stack gap={2}>
                {CUT_AND_TILE_MODES.map((choice) => (
                  <ChoiceRow
                    key={choice.mode}
                    value={choice.mode}
                    icon={choice.icon}
                    label={t(choice.labelKey)}
                    description={t(choice.descriptionKey)}
                    disabled={base.endpointLoading}
                    testId={`cut-and-tile-mode-${choice.mode}`}
                  />
                ))}
              </Stack>
            </Radio.Group>

            <CutAndTileSettings
              parameters={parameters}
              onParameterChange={base.params.updateParameter}
              disabled={base.endpointLoading}
            />

            <CutAndTileSummary outcome={outcome} />

            <CutAndTilePreview
              parameters={parameters}
              thumbnailUrl={record?.thumbnailUrl ?? null}
            />
          </Stack>
        ),
      },
    ],
    executeButton: {
      text:
        parameters.mode === "grid"
          ? t("cutAndTile.submit.grid", "Cut pages")
          : t("cutAndTile.submit.poster", "Create poster PDF"),
      loadingText: t("loading"),
      onClick: base.handleExecute,
      isVisible: !base.hasResults,
      endpointEnabled: base.endpointEnabled,
      paramsValid:
        base.params.validateParameters() && !cutAndTileBlocksRun(outcome),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("cutAndTile.resultsTitle", "Cut & tile results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default CutAndTile as ToolComponent;
