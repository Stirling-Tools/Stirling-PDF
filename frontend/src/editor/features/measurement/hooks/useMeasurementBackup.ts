import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Measurement } from "../utils/measurementTypes";
import { readMeasurementPayloadFromPdf, type MeasurementPayload } from "../utils/measurementPdfStorage";
import type { RulerOverlayHandle } from "../components/RulerOverlay";

type Options = {
  documentName?: string;
  stableId?: string | number | null;
  overlayRef: RefObject<RulerOverlayHandle | null>;
  sourceFile?: File | null;
};

type MembershipSetter = Dispatch<SetStateAction<Record<string, string>>>;

/** Keep Stirling's existing per-document measurement backup key and restoration behavior. */
export function useMeasurementBackup({ documentName, stableId, overlayRef, sourceFile }: Options) {
  const [loadedPayload, setLoadedPayload] = useState<MeasurementPayload | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [panelMeasurements, setPanelMeasurements] = useState<Measurement[]>([]);
  const measurementBackupKey = `stirling-measurement-backup-v1:${documentName ?? stableId ?? "unknown"}`;
  const backupKeyRef = useRef(measurementBackupKey);
  useEffect(() => { backupKeyRef.current = measurementBackupKey; }, [measurementBackupKey]);

  // The PDF itself is authoritative; localStorage is only a legacy fallback.
  useEffect(() => {
    let cancelled = false;
    setLoadedKey(null);
    setLoadedPayload(null);
    if (!sourceFile) return;
    (async () => {
      try {
        const payload = await readMeasurementPayloadFromPdf(await sourceFile.arrayBuffer());
        if (!cancelled) setLoadedPayload(payload);
      } catch (error) {
        console.warn("Kunne ikke lese målinger fra PDF", error);
      } finally {
        if (!cancelled) setLoadedKey(measurementBackupKey);
      }
    })();
    return () => { cancelled = true; };
  }, [sourceFile, measurementBackupKey]);

  const saveMeasurementBackup = useCallback((next: Measurement[]) => {
    try {
      // Never overwrite a non-empty backup with an accidental empty restoration.
      if (next.length) localStorage.setItem(backupKeyRef.current, JSON.stringify(next));
    } catch (error) { console.warn("Kunne ikke sikkerhetslagre målinger", error); }
  }, []);

  const subscribeToMeasurements = useCallback((setSavedGroupMembership: MembershipSetter) => {
    const overlay = overlayRef.current;
    if (!overlay || loadedKey !== measurementBackupKey) return;

    const existing = overlay.getMeasurements();
    if (loadedPayload) {
      // Restore even an empty array: it means this PDF intentionally has no marks.
      overlay.restoreMeasurements(loadedPayload.measurements);
    } else if (!existing.length) {
      try {
        const raw = localStorage.getItem(measurementBackupKey);
        if (raw) {
          const recovered = JSON.parse(raw) as Measurement[];
          if (Array.isArray(recovered) && recovered.length) overlay.restoreMeasurements(recovered);
        }
      } catch (error) { console.warn("Kunne ikke hente målesikkerhetskopi", error); }
    }
    setPanelMeasurements(overlay.getMeasurements());
    return overlay.onMeasurementsChange((next) => {
      saveMeasurementBackup(next);
      setPanelMeasurements(next);
      setSavedGroupMembership(previous => {
        let changed = false;
        const merged = { ...previous };
        next.forEach(m => {
          if (m.groupId && merged[m.id] !== m.groupId) {
            merged[m.id] = m.groupId;
            changed = true;
          }
        });
        return changed ? merged : previous;
      });
    });
  }, [measurementBackupKey, overlayRef, saveMeasurementBackup, loadedKey, loadedPayload]);

  return { panelMeasurements, subscribeToMeasurements, embeddedGroups: loadedPayload?.groups ?? null, embeddedPageScales: loadedPayload?.pageScales ?? null };
}
