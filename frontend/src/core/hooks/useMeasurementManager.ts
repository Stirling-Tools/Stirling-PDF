import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Measurement } from "@app/utils/measurementTypes";
import type {
  RulerOverlayHandle,
  MeasureScale,
  PageMeasureScales,
} from "@app/components/viewer/RulerOverlay";
import {
  loadSessionMap,
  saveSessionMap,
  validateMeasureScale,
  validateMeasurement,
} from "@app/utils/measurementUtils";
import type { StirlingFile } from "@app/types/fileContext";
import { isStirlingFile, getFormFillFileId } from "@app/types/fileContext";
import { extractPageMeasureScales } from "@app/utils/pdfMeasurementExtraction";

// ─── Hook: useMeasurementManager ──────────────────────────────────────────────

interface EffectiveFileLike {
  file: Blob | File;
  url: string | null;
}

type ViewerFile = StirlingFile | File | null | undefined;

interface UseMeasurementManagerProps {
  currentFile: ViewerFile;
  effectiveFile: EffectiveFileLike | null | undefined;
  rulerOverlayRef: RefObject<RulerOverlayHandle | null>;
}

interface UseMeasurementManagerReturn {
  isRulerActive: boolean;
  setIsRulerActive: (v: boolean) => void;
  pageMeasureScales: PageMeasureScales | null;
  customScale: MeasureScale | null;
  handleSetCustomScale: (scale: MeasureScale | null) => void;
}

export function useMeasurementManager({
  currentFile,
  effectiveFile,
  rulerOverlayRef,
}: UseMeasurementManagerProps): UseMeasurementManagerReturn {
  const [isRulerActive, setIsRulerActive] = useState(false);
  const [pageMeasureScales, setPageMeasureScales] =
    useState<PageMeasureScales | null>(null);
  const [customScale, setCustomScale] = useState<MeasureScale | null>(null);
  const [scalesByFileId, setScalesByFileId] = useState<
    Map<string, MeasureScale | null>
  >(new Map());
  const [measurementsByFileId, setMeasurementsByFileId] = useState<
    Map<string, Measurement[]>
  >(new Map());

  const restoredFileKeyRef = useRef<string | null>(null);

  const getStableFileKey = useCallback((file: ViewerFile): string | null => {
    if (!file) return null;
    if (isStirlingFile(file)) {
      return file.fileId;
    }
    return getFormFillFileId(file);
  }, []);

  const currentFileKey = getStableFileKey(currentFile);

  function persistSessionValue(
    storageKey: string,
    fileKey: string,
    value: MeasureScale | Measurement[] | null,
    label: string,
  ) {
    try {
      saveSessionMap(storageKey, fileKey, value);
    } catch (error) {
      console.error(`[Measurement] Failed to persist ${label}:`, error);
    }
  }

  function readStoredScale(fileKey: string): MeasureScale | null | undefined {
    const storedMap = loadSessionMap("stirling_scales");
    if (!(fileKey in storedMap)) {
      return undefined;
    }

    const storedValue = storedMap[fileKey];
    return validateMeasureScale(storedValue) ? storedValue : null;
  }

  function readStoredMeasurements(fileKey: string): Measurement[] | undefined {
    const storedMap = loadSessionMap("stirling_measurements");
    if (!(fileKey in storedMap)) {
      return undefined;
    }

    const storedValue = storedMap[fileKey];
    if (!Array.isArray(storedValue)) {
      return [];
    }

    return storedValue.filter((measurement) =>
      validateMeasurement(measurement),
    );
  }

  function persistScale(fileKey: string, scale: MeasureScale | null) {
    persistSessionValue("stirling_scales", fileKey, scale, "scale");
  }

  function persistMeasurements(fileKey: string, value: Measurement[]) {
    persistSessionValue(
      "stirling_measurements",
      fileKey,
      value,
      "measurements",
    );
  }

  const handleSetCustomScale = useCallback(
    (scale: MeasureScale | null) => {
      const fileKey = currentFileKey;

      if (fileKey) {
        setScalesByFileId((prev) => new Map(prev).set(fileKey, scale));
        persistScale(fileKey, scale);
      }

      setCustomScale(scale);
    },
    [currentFileKey],
  );

  useEffect(() => {
    if (!currentFileKey) {
      setPageMeasureScales(null);
      setCustomScale(null);
      setIsRulerActive(false);
      rulerOverlayRef.current?.clearAll(true);
      restoredFileKeyRef.current = null;
      return;
    }

    if (restoredFileKeyRef.current === currentFileKey) {
      return;
    }
    restoredFileKeyRef.current = currentFileKey;

    const storedScale = readStoredScale(currentFileKey);
    const savedScale =
      storedScale === undefined
        ? (scalesByFileId.get(currentFileKey) ?? null)
        : storedScale;

    setCustomScale(savedScale);

    const storedMeasurements = readStoredMeasurements(currentFileKey);
    const savedMeasurements =
      storedMeasurements === undefined
        ? (measurementsByFileId.get(currentFileKey) ?? [])
        : storedMeasurements;

    rulerOverlayRef.current?.clearAll(true);
    rulerOverlayRef.current?.restoreMeasurements(savedMeasurements);
  }, [currentFileKey, measurementsByFileId, rulerOverlayRef, scalesByFileId]);

  useEffect(() => {
    const fileBlob = effectiveFile?.file;
    if (!fileBlob || !currentFileKey) {
      setPageMeasureScales(null);
      return;
    }

    setPageMeasureScales(null);

    let cancelled = false;
    extractPageMeasureScales(fileBlob)
      .then((scales) => {
        if (!cancelled) {
          setPageMeasureScales(scales);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("[Measurement] Failed to load PDF scales", error);
          setPageMeasureScales(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentFileKey, effectiveFile?.file]);

  useEffect(() => {
    if (!rulerOverlayRef.current || !currentFileKey) return;

    const unsubscribe = rulerOverlayRef.current.onMeasurementsChange(
      (newMeasurements: Measurement[]) => {
        const validMeasurements = newMeasurements.filter((measurement) =>
          validateMeasurement(measurement),
        );

        setMeasurementsByFileId((prev) =>
          new Map(prev).set(currentFileKey, validMeasurements),
        );
        persistMeasurements(currentFileKey, validMeasurements);
      },
    );

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [currentFileKey, rulerOverlayRef]);

  return {
    isRulerActive,
    setIsRulerActive,
    pageMeasureScales,
    customScale,
    handleSetCustomScale,
  };
}
