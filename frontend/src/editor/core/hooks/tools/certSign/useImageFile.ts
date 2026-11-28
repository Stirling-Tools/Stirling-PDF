import { useEffect, useState } from "react";

/** `blob` decoded as an image for drawing on a canvas, or null until it loads or when it can't. */
export function useImageFile(blob: Blob | null): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    setImage(null);
    if (!blob) return;
    let cancelled = false;
    const url = URL.createObjectURL(blob);
    const next = new Image();
    next.onload = () => {
      if (!cancelled) setImage(next);
    };
    next.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [blob]);

  return image;
}
