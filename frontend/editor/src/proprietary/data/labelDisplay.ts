// Proprietary override of the label-display seam: resolves a classification
// label id to its display name, translated via `classification.labels.<id>`.

import { useTranslation } from "react-i18next";

/** Returns a resolver mapping a label id to its (translated) display name. */
export function useLabelName(): (id: string) => string {
  const { t } = useTranslation();
  return (id) => t(`classification.labels.${id}`, id);
}
