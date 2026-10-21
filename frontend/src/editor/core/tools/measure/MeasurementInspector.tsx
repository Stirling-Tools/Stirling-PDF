import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { Input } from "@app/ui/Input";
import { Slider } from "@app/ui/Slider";
import { useMeasurements } from "@app/contexts/MeasurementContext";
import type { Measurement } from "@app/utils/measurementTypes";
import {
  MAX_STROKE_WIDTH,
  MIN_STROKE_WIDTH,
  editingUnit,
  formatMeasurementValue,
  fromViewPoint,
  pointAtAngle,
  segmentAngle,
  segmentLength,
  toViewPoint,
  unitsPerPoint,
} from "@app/utils/measurementUtils";
import { describeMeasurement } from "@app/utils/measurementDescription";
import { ColorSwatches } from "@app/tools/measure/ColorSwatches";
import { NumberField } from "@app/tools/measure/NumberField";
import { KIND_ICONS } from "@app/tools/measure/MeasurementList";
import styles from "@app/tools/measure/Measure.module.css";

/**
 * Decimals shown in the fields. Fixed rather than the label precision
 * setting: "Decimals: 0" is for tidy labels and must not round what is
 * typed here.
 */
const EDIT_DECIMALS = 3;

interface MeasurementInspectorProps {
  measurement: Measurement;
  name: string;
}

/**
 * Exact editing of the selected measurement. Values are as the page is shown,
 * rotation included: positions from its top-left corner, angles from the
 * horizontal, in the same real-world unit as lengths.
 */
export function MeasurementInspector({
  measurement,
  name,
}: MeasurementInspectorProps) {
  const { t } = useTranslation();
  const {
    settings,
    scaleFor,
    pageViewFor,
    updateMeasurement,
    deleteMeasurement,
    setSelectedId,
  } = useMeasurements();
  const scale = scaleFor(measurement);
  const unit = editingUnit(scale, settings);
  const perPoint = unitsPerPoint(scale, unit);
  const color = measurement.color ?? settings.defaultColor;
  const strokeWidth = measurement.strokeWidth ?? settings.defaultStrokeWidth;
  const { id, points } = measurement;
  const pageIndex = points[0].pageIndex;
  const view = pageViewFor(pageIndex);
  const viewPoints = points.map((p) => toViewPoint(p, view));

  const setViewPoints = (next: { x: number; y: number }[]) =>
    updateMeasurement(id, {
      points: next.map((p) => fromViewPoint(p, view, pageIndex)),
    });
  const toPage = (value: number) => value / perPoint;

  const renderLineFields = () => {
    const [start, end] = viewPoints;
    const length = segmentLength(points[0], points[1]);
    const angle = segmentAngle(start, end);
    const moveTo = (x: number, y: number) => {
      const dx = x - start.x;
      const dy = y - start.y;
      setViewPoints(viewPoints.map((p) => ({ x: p.x + dx, y: p.y + dy })));
    };
    return (
      <div className={styles.fieldGrid}>
        <NumberField
          label="X"
          value={start.x * perPoint}
          unit={unit}
          decimals={EDIT_DECIMALS}
          onChange={(x) => moveTo(toPage(x), start.y)}
        />
        <NumberField
          label="Y"
          value={start.y * perPoint}
          unit={unit}
          decimals={EDIT_DECIMALS}
          onChange={(y) => moveTo(start.x, toPage(y))}
        />
        <NumberField
          label={t("measure.inspector.length", "Length")}
          value={length * perPoint}
          unit={unit}
          decimals={EDIT_DECIMALS}
          min={0}
          onChange={(value) => {
            // Zero length would lose the angle, so the next edit could not keep it.
            if (value > 0) {
              setViewPoints([start, pointAtAngle(start, toPage(value), angle)]);
            }
          }}
        />
        <NumberField
          label={t("measure.inspector.angle", "Angle")}
          value={angle}
          unit="°"
          decimals={2}
          onChange={(value) =>
            setViewPoints([start, pointAtAngle(start, length, value)])
          }
        />
      </div>
    );
  };

  const renderPointFields = () => (
    <div className={styles.pointTable}>
      <div className={styles.pointRow} aria-hidden="true">
        <span />
        <span className={styles.numberFieldLabel}>X</span>
        <span className={styles.numberFieldLabel}>Y</span>
      </div>
      {viewPoints.map((point, index) => {
        const setPoint = (next: Partial<{ x: number; y: number }>) =>
          setViewPoints(
            viewPoints.map((p, i) => (i === index ? { ...p, ...next } : p)),
          );
        return (
          <div key={index} className={styles.pointRow}>
            <span className={styles.pointIndex}>{index + 1}</span>
            <NumberField
              label={t("measure.inspector.pointX", "Point {{n}} X", {
                n: index + 1,
              })}
              hideLabel
              value={point.x * perPoint}
              unit={unit}
              decimals={EDIT_DECIMALS}
              onChange={(x) => setPoint({ x: toPage(x) })}
            />
            <NumberField
              label={t("measure.inspector.pointY", "Point {{n}} Y", {
                n: index + 1,
              })}
              hideLabel
              value={point.y * perPoint}
              unit={unit}
              decimals={EDIT_DECIMALS}
              onChange={(y) => setPoint({ y: toPage(y) })}
            />
          </div>
        );
      })}
    </div>
  );

  return (
    <section className={styles.inspector} aria-label={name}>
      <div className={styles.inspectorHeader}>
        <span className={styles.kindIcon} style={{ color }}>
          <Icon name={KIND_ICONS[measurement.kind]} size={16} />
        </span>
        <Input
          inputSize="sm"
          className={styles.nameInput}
          aria-label={t("measure.list.name", "Name")}
          placeholder={name}
          value={measurement.label ?? ""}
          onChange={(e) =>
            updateMeasurement(id, {
              label: e.currentTarget.value || undefined,
            })
          }
        />
        <ActionIcon
          variant="tertiary"
          size="sm"
          aria-label={t("measure.inspector.deselect", "Deselect")}
          onClick={() => setSelectedId(null)}
        >
          <Icon name="x" size={14} />
        </ActionIcon>
      </div>

      <div className={styles.inspectorValue}>
        <span className={styles.inspectorValueMain}>
          {formatMeasurementValue(measurement, scale, settings)}
        </span>
        <span className={styles.inspectorValueSub}>
          {describeMeasurement(t, measurement, scale, settings, view)}
        </span>
      </div>

      {measurement.kind === "distance"
        ? renderLineFields()
        : renderPointFields()}

      <span className={styles.numberFieldLabel}>
        {t("measure.inspector.style", "Colour and thickness")}
      </span>
      <div className={styles.styleRow}>
        <ColorSwatches
          value={color}
          onChange={(next) => updateMeasurement(id, { color: next })}
        />
        <div className={styles.thickness}>
          <Slider
            inputSize="sm"
            min={MIN_STROKE_WIDTH}
            max={MAX_STROKE_WIDTH}
            step={0.5}
            value={strokeWidth}
            onChange={(next) => updateMeasurement(id, { strokeWidth: next })}
            aria-label={t("measure.list.width", "Line thickness")}
          />
        </div>
      </div>

      <Button
        size="sm"
        variant="tertiary"
        accent="danger"
        leftSection={<Icon name="trash" size={14} />}
        onClick={() => deleteMeasurement(id)}
      >
        {t("measure.list.delete", "Delete measurement")}
      </Button>
    </section>
  );
}
