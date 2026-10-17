// Proprietary override of the label-display seam: resolves a classification
// label id to its display name, translated via `classification.labels.<id>`.
// Every delivered locale translates all of the built-in labels, and a custom
// team label has no built-in name to fall back to, so the id is the fallback.

import { useTranslation } from "react-i18next";

/** Returns a resolver mapping a label id to its (translated) display name. */
export function useLabelName(): (id: string) => string {
  const { t } = useTranslation();
  return (id) => t(`classification.labels.${id}`, id);
}
