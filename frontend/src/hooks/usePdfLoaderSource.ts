import { useEffect, useState } from 'react';

export type PdfLoaderSource =
  | { type: 'url'; id: string; name?: string; url: string }
  | { type: 'buffer'; id: string; name?: string; content: ArrayBuffer };

interface UsePdfLoaderSourceOptions {
  file?: File | Blob;
  url?: string | null;
  fallbackId: string;
}

function hasFileName(value: File | Blob): value is File {
  return 'name' in value && typeof value.name === 'string';
}

function isPdfFile(file: File | Blob): boolean {
  if ('type' in file && file.type) {
    return file.type === 'application/pdf';
  }
  if (hasFileName(file)) {
    return file.name.toLowerCase().endsWith('.pdf');
  }
  return false;
}

function isPdfUrl(url: string): boolean {
  return url.toLowerCase().includes('.pdf');
}

export function usePdfLoaderSource({ file, url, fallbackId }: UsePdfLoaderSourceOptions) {
  const [source, setSource] = useState<PdfLoaderSource | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const prepare = async () => {
      setError(null);

      if (file) {
        if (!isPdfFile(file)) {
          setError('Datei ist kein PDF.');
          setSource(null);
          return;
        }

        setIsLoading(true);
        setSource(null);

        const name = hasFileName(file) && file.name.trim().length > 0 ? file.name : undefined;
        const id = name ?? fallbackId;

        try {
          const content = await file.arrayBuffer();
          if (cancelled) return;

          setSource({
            type: 'buffer',
            id,
            name,
            content,
          });
        } catch (err) {
          if (cancelled) return;

          setError(err instanceof Error ? err.message : String(err));
          setSource(null);
        } finally {
          if (!cancelled) {
            setIsLoading(false);
          }
        }

        return;
      }

      setIsLoading(false);

      if (typeof url === 'string' && url.length > 0) {
        if (!isPdfUrl(url)) {
          setError('URL zeigt nicht auf ein PDF.');
          setSource(null);
          return;
        }

        const id = url || fallbackId;

        if (!cancelled) {
          setSource({
            type: 'url',
            id,
            url,
          });
        }
      } else {
        if (!cancelled) {
          setSource(null);
        }
      }
    };

    void prepare();

    return () => {
      cancelled = true;
    };
  }, [file, url, fallbackId]);

  return { source, isLoading, error };
}
