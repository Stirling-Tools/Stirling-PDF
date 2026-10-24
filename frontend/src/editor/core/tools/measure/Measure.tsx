/**
 * Measure tool panel. Drawing happens on the viewer through RulerOverlay; this
 * panel picks what to draw, says what the next click does, edits the selected
 * measurement exactly, holds the drawing scale, and saves into the PDF.
 */
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { InfoTooltip } from "@editor/ui/InfoTooltip";
import { SegmentedControl } from "@editor/ui/SegmentedControl";
import { Tooltip } from "@editor/components/shared/Tooltip";
import { alert } from "@editor/components/toast";
import { useMeasurements } from "@editor/contexts/MeasurementContext";
import type { BaseToolProps } from "@editor/types/tool";
import type { MeasurementKind } from "@editor/utils/measurementTypes";
import { formatMeasurementValue } from "@editor/utils/measurementUtils";
import { MeasureScaleCard } from "@editor/tools/measure/MeasureScaleCard";
import { MeasureSettings } from "@editor/tools/measure/MeasureSettings";
import { MeasurementInspector } from "@editor/tools/measure/MeasurementInspector";
import {
  KIND_ICONS,
  MeasurementList,
  kindLabel,
  useMeasurementNames,
} from "@editor/tools/measure/MeasurementList";
import { useSaveMeasurementsToPdf } from "@editor/tools/measure/useSaveMeasurementsToPdf";
import { EncryptedPdfError } from "@editor/tools/measure/measurementDrawing";
import { useViewerCurrentPageIndex } from "@editor/tools/measure/useViewerCurrentPageIndex";
import styles from "@editor/tools/measure/Measure.module.css";

const KINDS: MeasurementKind[] = ["distance", "perimeter", "area"];

function useNextStepText(): string {
  const { t } = useTranslation();
  const { mode, draftPointCount } = useMeasurements();
  if (mode === "calibrate") {
    return draftPointCount === 0
      ? t("measure.step.calibrateStart", "Click one end of a length you know.")
      : t("measure.step.calibrateEnd", "Click the other end.");
  }
  if (draftPointCount === 0) {
    switch (mode) {
      case "distance":
        return t(
          "measure.step.distanceStart",
          "Click to start a line. Measures a straight distance.",
        );
      case "perimeter":
        return t(
          "measure.step.pathStart",
          "Click to start a path. Measures the total length along connected lines.",
        );
      case "area":
        return t(
          "measure.step.areaStart",
          "Click the first corner. Measures the area inside a closed shape.",
        );
    }
  }
  switch (mode) {
    case "distance":
      return t("measure.step.distanceEnd", "Click to place the end.");
    case "perimeter":
      return t(
        "measure.step.pathNext",
        "Click to add points. Double-click or press Esc to finish.",
      );
    case "area":
      return t(
        "measure.step.areaNext",
        "Click to add corners. Click the first corner or press Esc to close.",
      );
  }
}

function ShortcutList() {
  const { t } = useTranslation();
  const rows: [string, string][] = [
    ["Shift", t("measure.keys.shift", "Lock to 45° steps")],
    ["Ctrl / ⌘", t("measure.keys.noSnap", "Turn snapping off")],
    ["Alt", t("measure.keys.alt", "Start on top of a measurement")],
    ["Backspace", t("measure.keys.undo", "Remove the last point")],
    ["Enter / Esc", t("measure.keys.finish", "Finish a path or area")],
    ["Esc", t("measure.keys.cancel", "Cancel a line, or deselect")],
    ["Delete", t("measure.keys.delete", "Delete the selected measurement")],
  ];
  return (
    <dl className={styles.shortcuts}>
      {rows.map(([key, action]) => (
        <div key={key} className={styles.shortcutRow}>
          <dt>
            <kbd>{key}</kbd>
          </dt>
          <dd>{action}</dd>
        </div>
      ))}
    </dl>
  );
}

const Measure = (_props: BaseToolProps) => {
  const { t } = useTranslation();
  const {
    fileKey,
    mode,
    setMode,
    measurements,
    selectedId,
    settings,
    scaleFor,
    clearMeasurements,
    draftPointCount,
    finishDrawing,
    cancelDrawing,
  } = useMeasurements();
  const isDrawingMultiPoint =
    draftPointCount > 0 && (mode === "perimeter" || mode === "area");
  const canFinish =
    (mode === "perimeter" && draftPointCount >= 2) ||
    (mode === "area" && draftPointCount >= 3);
  const currentPageIndex = useViewerCurrentPageIndex();
  const names = useMeasurementNames(measurements);
  const { save, canSave, isSaving } = useSaveMeasurementsToPdf();
  const nextStep = useNextStepText();
  const selected = measurements.find((m) => m.id === selectedId) ?? null;
  const activeKind: MeasurementKind = mode === "calibrate" ? "distance" : mode;

  const handleSave = async () => {
    try {
      const count = await save();
      alert({
        alertType: "success",
        title: t("measure.saved", "Saved {{count}} measurements to the PDF", {
          count,
        }),
      });
    } catch (error) {
      if (error instanceof EncryptedPdfError) {
        alert({
          alertType: "error",
          title: t("measure.saveEncrypted", "This PDF is password-protected"),
          body: t(
            "measure.saveEncryptedBody",
            "Remove its password with the Remove Password tool, then save your measurements again. They are still here.",
          ),
        });
        return;
      }
      console.error("[Measure] Failed to save measurements", error);
      alert({
        alertType: "error",
        title: t(
          "measure.saveFailed",
          "Could not save measurements to the PDF",
        ),
      });
    }
  };

  const handleCopy = async () => {
    const lines = measurements.map((m) =>
      [
        t("measure.scale.pageLabel", "Page {{page}}", {
          page: m.points[0].pageIndex + 1,
        }),
        names.get(m.id) ?? kindLabel(t, m.kind),
        formatMeasurementValue(m, scaleFor(m), settings),
      ].join("\t"),
    );
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      alert({
        alertType: "success",
        title: t("measure.copied", "Measurements copied"),
      });
    } catch {
      alert({
        alertType: "error",
        title: t("measure.copyFailed", "Could not copy to the clipboard"),
      });
    }
  };

  if (!fileKey) {
    return (
      <p className={styles.emptyList}>
        {t("measure.noFile", "Open a PDF in the viewer to start measuring.")}
      </p>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <SegmentedControl
          fullWidth
          size="sm"
          value={activeKind}
          onChange={setMode}
          ariaLabel={t("measure.mode.label", "Measurement type")}
          options={KINDS.map((kind) => ({
            value: kind,
            label: (
              <span className={styles.modeLabel}>
                <Icon name={KIND_ICONS[kind]} size={14} />
                <span className={styles.modeLabelText}>
                  {kindLabel(t, kind)}
                </span>
              </span>
            ),
          }))}
        />
        <div
          className={`${styles.nextStep} ${mode === "calibrate" ? styles.nextStepCalibrating : ""}`}
          role="status"
        >
          <Icon name="pointer" size={14} />
          <span className={styles.nextStepText}>{nextStep}</span>
          <InfoTooltip
            label={<ShortcutList />}
            ariaLabel={t("measure.keys.title", "Keyboard shortcuts")}
            position="bottom-end"
          />
        </div>
        {draftPointCount > 0 && (
          <div className={styles.drawingActions}>
            {isDrawingMultiPoint && (
              <Button
                size="sm"
                disabled={!canFinish}
                leftSection={<Icon name="check" size={14} />}
                onClick={finishDrawing}
              >
                {mode === "area"
                  ? t("measure.drawing.close", "Close shape")
                  : t("measure.drawing.finish", "Finish path")}
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={cancelDrawing}>
              {t("measure.drawing.cancel", "Cancel")}
            </Button>
          </div>
        )}
      </div>

      <div className={styles.body}>
        {selected && (
          <MeasurementInspector
            key={selected.id}
            measurement={selected}
            name={names.get(selected.id) ?? ""}
          />
        )}

        <MeasureScaleCard currentPageIndex={currentPageIndex} />

        <section className={styles.listSection}>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>
              {t("measure.list.title", "Measurements")}
            </span>
            {measurements.length > 0 && (
              <span className={styles.count}>{measurements.length}</span>
            )}
          </div>
          <MeasurementList names={names} />
        </section>

        <MeasureSettings />
      </div>

      <div className={styles.footer}>
        <Button
          fullWidth
          size="sm"
          leftSection={<Icon name="save" size={14} />}
          disabled={!canSave}
          loading={isSaving}
          onClick={handleSave}
        >
          {t("measure.saveToPdf", "Save to PDF")}
        </Button>
        <Tooltip content={t("measure.copy", "Copy as text")} position="top">
          <ActionIcon
            variant="secondary"
            aria-label={t("measure.copy", "Copy as text")}
            disabled={measurements.length === 0}
            onClick={handleCopy}
          >
            <Icon name="copy" size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip content={t("measure.clearAll", "Clear all")} position="top">
          <ActionIcon
            variant="secondary"
            aria-label={t("measure.clearAll", "Clear all")}
            disabled={measurements.length === 0}
            onClick={clearMeasurements}
          >
            <Icon name="trash" size={16} />
          </ActionIcon>
        </Tooltip>
      </div>
    </div>
  );
};

export default Measure;
