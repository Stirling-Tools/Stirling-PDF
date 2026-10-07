import { useEffect, useState } from "react";
import {
  cleanUpSignatureImage,
  type UploadCleanup,
} from "@app/utils/signatureImage";

interface CleanedImage {
  dataUrl: string | null;
  processing: boolean;
  failed: boolean;
}

const EMPTY: CleanedImage = { dataUrl: null, processing: false, failed: false };

export function useCleanedSignatureImage(
  source: string | null,
  cleanup: UploadCleanup,
): CleanedImage {
  const [state, setState] = useState<CleanedImage>(EMPTY);
  const { removeBackground, trim, inkColor, quarterTurns } = cleanup;

  useEffect(() => {
    if (!source) {
      setState(EMPTY);
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, processing: true }));
    cleanUpSignatureImage(source, {
      removeBackground,
      trim,
      inkColor,
      quarterTurns,
    })
      .then((dataUrl) => {
        if (!cancelled) setState({ dataUrl, processing: false, failed: false });
      })
      .catch(() => {
        if (!cancelled)
          setState({ dataUrl: null, processing: false, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [source, removeBackground, trim, inkColor, quarterTurns]);

  return state;
}
