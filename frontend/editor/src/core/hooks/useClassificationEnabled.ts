// Whether classification (sidebar grouping, label chips, file-details section)
// is active in this build. Core has no classifier; proprietary overrides to true.

export function useClassificationEnabled(): boolean {
  return false;
}
