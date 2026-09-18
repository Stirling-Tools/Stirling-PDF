// Form-layer rendering materialises missing widget appearances in memory,
// so save strips ones created after load on pages the user never regenerated.
const APPEARANCE_MODES = [0, 1, 2] as const;

interface AppearanceModule {
  FPDFPage_GetAnnotCount?: (page: number) => number;
  FPDFPage_GetAnnot?: (page: number, index: number) => number;
  FPDFPage_CloseAnnot?: (annot: number) => void;
  FPDFAnnot_GetAP?: (
    annot: number,
    mode: number,
    buffer: number,
    buflen: number,
  ) => number;
  FPDFAnnot_SetAP?: (annot: number, mode: number, value: number) => boolean;
}

function appearanceModule(m: unknown): AppearanceModule | null {
  const mod = m as AppearanceModule;
  if (
    typeof mod.FPDFPage_GetAnnotCount !== "function" ||
    typeof mod.FPDFPage_GetAnnot !== "function" ||
    typeof mod.FPDFPage_CloseAnnot !== "function" ||
    typeof mod.FPDFAnnot_GetAP !== "function" ||
    typeof mod.FPDFAnnot_SetAP !== "function"
  ) {
    return null;
  }
  return mod;
}

function withAnnot(
  mod: AppearanceModule,
  pagePtr: number,
  index: number,
  fn: (annot: number) => void,
): void {
  let annot = 0;
  try {
    annot = mod.FPDFPage_GetAnnot!(pagePtr, index);
    if (!annot) return;
    fn(annot);
  } catch {
    /* best-effort: one unreadable annotation skips, never aborts */
  } finally {
    if (annot) {
      try {
        mod.FPDFPage_CloseAnnot!(annot);
      } catch {
        /* ignore */
      }
    }
  }
}

// Record which (annotation, mode) pairs exist now. Null when the build
// lacks the entry points, in which case save keeps current behaviour.
// Keys are positional indices: the text editor never adds or removes
// annotations mid-session, so they stay stable between load and save.
export function snapshotAnnotAppearances(
  m: unknown,
  pagePtr: number,
): Set<string> | null {
  const mod = appearanceModule(m);
  if (!mod) return null;
  const present = new Set<string>();
  try {
    const count = mod.FPDFPage_GetAnnotCount!(pagePtr);
    for (let i = 0; i < count; i++) {
      withAnnot(mod, pagePtr, i, (annot) => {
        for (const mode of APPEARANCE_MODES) {
          // GetAP reports UTF-16 bytes including NUL, so absent reads 2.
          let length = 2;
          try {
            length = mod.FPDFAnnot_GetAP!(annot, mode, 0, 0);
          } catch {
            continue;
          }
          if (length > 2) present.add(`${i}:${mode}`);
        }
      });
    }
  } catch {
    return null;
  }
  return present;
}

// Delete appearances absent from the snapshot. Null value deletes the entry.
export function stripGeneratedAppearances(
  m: unknown,
  pagePtr: number,
  snapshot: Set<string>,
): number {
  const mod = appearanceModule(m);
  if (!mod) return 0;
  let removed = 0;
  try {
    const count = mod.FPDFPage_GetAnnotCount!(pagePtr);
    for (let i = 0; i < count; i++) {
      withAnnot(mod, pagePtr, i, (annot) => {
        for (const mode of APPEARANCE_MODES) {
          if (snapshot.has(`${i}:${mode}`)) continue;
          let length = 2;
          try {
            length = mod.FPDFAnnot_GetAP!(annot, mode, 0, 0);
          } catch {
            continue;
          }
          if (length <= 2) continue;
          try {
            if (mod.FPDFAnnot_SetAP!(annot, mode, 0)) removed += 1;
          } catch {
            /* keep the appearance rather than fail the save */
          }
        }
      });
    }
  } catch {
    /* best-effort */
  }
  return removed;
}
