import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Icon, type IconName } from "@editor/ui/Icon";
import { useMeasurements } from "@editor/contexts/MeasurementContext";
import { useViewer } from "@editor/contexts/ViewerContext";
import type {
  Measurement,
  MeasurementKind,
} from "@editor/utils/measurementTypes";
import { formatMeasurementValue } from "@editor/utils/measurementUtils";
import styles from "@editor/tools/measure/Measure.module.css";

export const KIND_ICONS: Record<MeasurementKind, IconName> = {
  distance: "ruler",
  perimeter: "polyline",
  area: "pentagon",
};

export function kindLabel(t: TFunction, kind: MeasurementKind): string {
  switch (kind) {
    case "distance":
      return t("measure.mode.distance", "Distance");
    case "perimeter":
      return t("measure.mode.path", "Path");
    case "area":
      return t("measure.mode.area", "Area");
  }
}

/** Names measurements without one "Area 1", "Area 2"… in creation order. */
export function useMeasurementNames(
  measurements: Measurement[],
): Map<string, string> {
  const { t } = useTranslation();
  return useMemo(() => {
    const counts: Record<MeasurementKind, number> = {
      distance: 0,
      perimeter: 0,
      area: 0,
    };
    const names = new Map<string, string>();
    for (const m of measurements) {
      counts[m.kind] += 1;
      names.set(m.id, m.label ?? `${kindLabel(t, m.kind)} ${counts[m.kind]}`);
    }
    return names;
  }, [measurements, t]);
}

interface MeasurementListProps {
  names: Map<string, string>;
}

export function MeasurementList({ names }: MeasurementListProps) {
  const { t } = useTranslation();
  const { measurements, selectedId, setSelectedId, settings, scaleFor } =
    useMeasurements();
  const { scrollActions, getScrollState } = useViewer();

  const byPage = useMemo(() => {
    const groups = new Map<number, Measurement[]>();
    for (const m of measurements) {
      const page = m.points[0].pageIndex;
      groups.set(page, [...(groups.get(page) ?? []), m]);
    }
    return [...groups.entries()].sort(([a], [b]) => a - b);
  }, [measurements]);
  const showPages = byPage.length > 1;

  const handleSelect = (measurement: Measurement) => {
    const isSelected = selectedId === measurement.id;
    setSelectedId(isSelected ? null : measurement.id);
    const pageNumber = measurement.points[0].pageIndex + 1;
    if (!isSelected && getScrollState().currentPage !== pageNumber) {
      scrollActions.scrollToPage(pageNumber);
    }
  };

  if (measurements.length === 0) {
    return (
      <p className={styles.emptyList}>
        {t("measure.list.empty", "Nothing measured yet.")}
      </p>
    );
  }

  return (
    <ul className={styles.list}>
      {byPage.map(([pageIndex, items]) => (
        <React.Fragment key={pageIndex}>
          {showPages && (
            <li className={styles.pageHeading}>
              {t("measure.scale.pageLabel", "Page {{page}}", {
                page: pageIndex + 1,
              })}
            </li>
          )}
          {items.map((m) => {
            const isSelected = selectedId === m.id;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  className={`${styles.listRow} ${isSelected ? styles.listRowSelected : ""}`}
                  onClick={() => handleSelect(m)}
                >
                  <span
                    className={styles.kindIcon}
                    style={{ color: m.color ?? settings.defaultColor }}
                  >
                    <Icon name={KIND_ICONS[m.kind]} size={14} />
                  </span>
                  <span className={styles.listName}>{names.get(m.id)}</span>
                  <span className={styles.listValue}>
                    {formatMeasurementValue(m, scaleFor(m), settings)}
                  </span>
                </button>
              </li>
            );
          })}
        </React.Fragment>
      ))}
    </ul>
  );
}
