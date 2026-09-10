import { useTranslation } from "react-i18next";
import { Box, Group, ScrollArea, Stack, Text, Tooltip } from "@mantine/core";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import ErrorOutlinedIcon from "@mui/icons-material/ErrorOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";

import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import TakeoffRow from "@app/components/tools/takeoff/TakeoffRow";
import { ownAnnotationType } from "@app/tools/takeoff/geometry";
import {
  estimateArchitecturalRatio,
  useTakeoffContext,
} from "@app/tools/takeoff/TakeoffContext";
import { downloadTextAsFile } from "@app/utils/downloadUtils";

/** Wraps a CSV field in quotes and escapes embedded quotes if it needs it. */
function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Take Off's sidebar panel: the scale/page/zoom toolbar, the materials list
// (each row arms its own length/area/count tool), and the running total.
// The canvas itself lives in a full-screen custom workbench (see
// TakeoffWorkbenchRegistration) so it has room to draw on the plan; this
// panel and that workbench share state via TakeoffContext.
const Takeoff = (_props: BaseToolProps) => {
  const { t } = useTranslation();
  const {
    activeFile,
    materials,
    annotations,
    pageIndex,
    numPages,
    zoom,
    currentScale,
    armedMaterialId,
    armedTool,
    selectedMaterialId,
    totalCost,
    calibrating,
    goToPage,
    changeZoom,
    armCalibration,
    armTool,
    addMaterial,
    updateMaterial,
    removeMaterial,
    setSelectedMaterialId,
    handleBack,
  } = useTakeoffContext();

  const handleExportCsv = () => {
    const header = [
      "Name",
      "Type",
      "Unit",
      "Quantity",
      "Unit price",
      "Line total",
    ];
    const lines = [header.map(csvField).join(",")];
    for (const m of materials) {
      const lineTotal = (m.quantity ?? 0) * (m.unitPrice ?? 0);
      lines.push(
        [
          m.name,
          ownAnnotationType(m.id, annotations) ?? "",
          m.unit,
          String(m.quantity ?? 0),
          String(m.unitPrice ?? 0),
          lineTotal.toFixed(2),
        ]
          .map(csvField)
          .join(","),
      );
    }
    downloadTextAsFile(lines.join("\r\n"), "takeoff.csv", "text/csv");
  };

  return (
    <Box style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Stack
        gap={4}
        p="sm"
        style={{ borderBottom: "1px solid var(--c-border)" }}
      >
        <Group gap="xs" wrap="nowrap">
          <ActionIcon
            variant="quiet"
            onClick={handleBack}
            aria-label={t("takeoff.back", "Back")}
          >
            <ArrowBackOutlinedIcon fontSize="small" />
          </ActionIcon>
          {activeFile && (
            <Text size="xs" c="dimmed" truncate>
              {activeFile.name}
            </Text>
          )}
        </Group>
        <Tooltip
          multiline
          w={280}
          label={t(
            "takeoff.scaleTooltip",
            "One scale applies to this whole page. If this sheet has multiple details at different scales (e.g. a 3D view at 1:10 next to an elevation at 1:20), recalibrate against the detail you're about to measure before drawing on it — otherwise the numbers will be wrong for anything not drawn at the calibrated scale.",
          )}
        >
          <Button
            size="sm"
            variant="secondary"
            fullWidth
            leftSection={
              currentScale ? (
                <CheckCircleOutlinedIcon fontSize="small" />
              ) : (
                <ErrorOutlinedIcon fontSize="small" />
              )
            }
            onClick={armCalibration}
          >
            {calibrating
              ? t("takeoff.dragKnownLength", "Drag a known length…")
              : currentScale
                ? t(
                    currentScale.source === "auto"
                      ? "takeoff.scaleAutoDetected"
                      : "takeoff.scaleSetWithRatio",
                    currentScale.source === "auto"
                      ? "Scale auto-detected (≈1:{{ratio}})"
                      : "Scale set (≈1:{{ratio}})",
                    {
                      ratio: (() => {
                        const ratio = estimateArchitecturalRatio(currentScale);
                        return ratio ? Math.round(ratio) : "?";
                      })(),
                    },
                  )
                : t("takeoff.scaleNotSet", "Scale not set")}
          </Button>
        </Tooltip>

        <Group justify="space-between" gap="xs">
          <Group gap={4}>
            <ActionIcon
              variant="quiet"
              disabled={pageIndex === 0}
              onClick={() => goToPage((p) => p - 1)}
              aria-label={t("takeoff.prevPage", "Previous page")}
            >
              <ChevronLeftIcon fontSize="small" />
            </ActionIcon>
            <Text size="xs" style={{ minWidth: 48, textAlign: "center" }}>
              {pageIndex + 1} / {numPages}
            </Text>
            <ActionIcon
              variant="quiet"
              disabled={pageIndex >= numPages - 1}
              onClick={() => goToPage((p) => p + 1)}
              aria-label={t("takeoff.nextPage", "Next page")}
            >
              <ChevronRightIcon fontSize="small" />
            </ActionIcon>
          </Group>

          <Group gap={4}>
            <ActionIcon
              variant="quiet"
              onClick={() => changeZoom((z) => z - 0.2)}
              aria-label={t("takeoff.zoomOut", "Zoom out")}
            >
              <ZoomOutIcon fontSize="small" />
            </ActionIcon>
            <Text size="xs" style={{ width: 42, textAlign: "center" }}>
              {Math.round(zoom * 100)}%
            </Text>
            <ActionIcon
              variant="quiet"
              onClick={() => changeZoom((z) => z + 0.2)}
              aria-label={t("takeoff.zoomIn", "Zoom in")}
            >
              <ZoomInIcon fontSize="small" />
            </ActionIcon>
          </Group>
        </Group>
      </Stack>

      <Group
        justify="space-between"
        px="sm"
        py="xs"
        style={{ borderBottom: "1px solid var(--c-border-subtle)" }}
      >
        <Text size="xs" fw={600} tt="uppercase" c="dimmed">
          {t("takeoff.materials", "Takeoffs")}
        </Text>
        <Group gap={4}>
          {materials.length > 0 && (
            <Tooltip label={t("takeoff.exportCsv", "Export CSV")}>
              <ActionIcon
                variant="quiet"
                size="sm"
                aria-label={t("takeoff.exportCsv", "Export CSV")}
                onClick={handleExportCsv}
              >
                <DownloadOutlinedIcon fontSize="small" />
              </ActionIcon>
            </Tooltip>
          )}
          <Button
            size="sm"
            variant="quiet"
            leftSection={<AddOutlinedIcon fontSize="small" />}
            onClick={addMaterial}
          >
            {t("takeoff.addRow", "Add")}
          </Button>
        </Group>
      </Group>

      <ScrollArea style={{ flex: 1 }}>
        {materials.length === 0 ? (
          <Text size="xs" c="dimmed" p="md">
            {t("takeoff.empty", "No items yet — add one to start measuring.")}
          </Text>
        ) : (
          <Stack gap={0}>
            {materials.map((m) => (
              <TakeoffRow
                key={m.id}
                material={m}
                materials={materials}
                annotations={annotations}
                armedTool={armedMaterialId === m.id ? armedTool : null}
                selected={selectedMaterialId === m.id}
                onArmTool={(tool) => armTool(m.id, tool)}
                onChange={(patch) => updateMaterial(m.id, patch)}
                onRemove={() => removeMaterial(m.id)}
                onSelect={() => setSelectedMaterialId(m.id)}
              />
            ))}
          </Stack>
        )}
      </ScrollArea>

      <Group
        justify="space-between"
        px="sm"
        py="sm"
        style={{ borderTop: "1px solid var(--c-border-subtle)" }}
      >
        <Text size="xs" fw={600} tt="uppercase" c="dimmed">
          {t("takeoff.estimatedTotal", "Estimated total")}
        </Text>
        <Text size="lg" fw={700}>
          $
          {totalCost.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </Text>
      </Group>
    </Box>
  );
};

(Takeoff as ToolComponent).tool = () => {
  throw new Error("Take Off does not support automation operations.");
};

(Takeoff as ToolComponent).getDefaultParameters = () => ({});

export default Takeoff as ToolComponent;
