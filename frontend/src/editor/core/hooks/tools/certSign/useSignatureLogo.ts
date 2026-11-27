import { useEffect, useState } from "react";
import {
  getSignatureLogo,
  onSignatureLogoChange,
} from "@editor/services/signatureLogoService";
import { useImageFile } from "@editor/hooks/tools/certSign/useImageFile";

export interface LoadedSignatureLogo {
  image: HTMLImageElement;
  custom: boolean;
}

/** The server's signature watermark logo decoded for drawing, or null until it loads. */
export function useSignatureLogo(): LoadedSignatureLogo | null {
  const [logo, setLogo] = useState<{ blob: Blob; custom: boolean } | null>(
    null,
  );
  const [version, setVersion] = useState(0);

  useEffect(() => onSignatureLogoChange(() => setVersion((v) => v + 1)), []);

  useEffect(() => {
    let cancelled = false;
    getSignatureLogo().then((next) => {
      if (!cancelled) setLogo(next);
    });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const image = useImageFile(logo?.blob ?? null);
  return image && logo ? { image, custom: logo.custom } : null;
}
