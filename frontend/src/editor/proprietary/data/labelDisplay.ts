// Proprietary override of the label-display seam: resolves a classification
// label id to its display name, translated via `classification.labels.<id>`
// (the built-in English name is the en-US default). Custom team labels aren't in
// the built-in map, so they fall back to the id.

import { useTranslation } from "react-i18next";
import { DEFAULT_CLASSIFICATION_LABELS } from "@app/data/classificationLabels";

const NAME_BY_ID = new Map(
  DEFAULT_CLASSIFICATION_LABELS.map((label) => [label.id, label.name]),
);

/** Returns a resolver mapping a label id to its (translated) display name. */
export function useLabelName(): (id: string) => string {
  const { t } = useTranslation();
  return (id) => t(`classification.labels.${id}`, NAME_BY_ID.get(id) ?? id);
}
