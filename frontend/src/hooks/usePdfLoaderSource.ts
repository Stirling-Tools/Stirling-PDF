import { useEffect, useState } from 'react';

export type PdfLoaderSource =
  | { type: 'url'; id: string; name?: string; url: string }
  | { type: 'buffer'; id: string; name?: string; content: ArrayBuffer };

interface UsePdfLoaderSourceOptions {
  file?: File | Blob;
  url?: string | null;
  fallbackId: string;
}

const RELATIVE_URL_BASE = 'http://localhost';
// The URL constructor requires an absolute base when parsing relative inputs.
// We use localhost to avoid accidental external network access while still
// enabling consistent parsing for relative URLs.

function hasFileName(value: File | Blob): value is File {
  return 'name' in value && typeof value.name === 'string';
}

async function hasPdfMagicBytes(file: Blob): Promise<boolean> {
  const magicSequence = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  if (file.size < magicSequence.length) {
    return false;
  }

  try {
    const sampleLength = Math.min(16, file.size);
    const headerBytes = new Uint8Array(await file.slice(0, sampleLength).arrayBuffer());

    for (let offset = 0; offset <= headerBytes.length - magicSequence.length; offset += 1) {
      let matches = true;
      for (let index = 0; index < magicSequence.length; index += 1) {
        if (headerBytes[offset + index] !== magicSequence[index]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

async function isPdfFile(file: File | Blob): Promise<boolean> {
  const hasMagicBytes = await hasPdfMagicBytes(file);
  if (hasMagicBytes) {
    return true;
  }

  const hasPdfMimeType = 'type' in file && typeof file.type === 'string' && file.type.length > 0
    ? file.type === 'application/pdf'
    : false;
  const hasPdfExtension = hasFileName(file) && file.name.toLowerCase().endsWith('.pdf');

  return hasPdfMimeType && hasPdfExtension;
}
function isPdfUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) {
    return false;
  }

  const lowerCaseUrl = trimmed.toLowerCase();
  if (lowerCaseUrl.startsWith('data:application/pdf')) {
    return true;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.pathname.toLowerCase().endsWith('.pdf');
  } catch {
    try {
      const parsed = new URL(trimmed, RELATIVE_URL_BASE);
      return parsed.pathname.toLowerCase().endsWith('.pdf');
    } catch {
      return lowerCaseUrl.endsWith('.pdf');
    }
  }
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
        const pdfDetected = await isPdfFile(file);
        if (cancelled) {
          return;
        }

        if (!pdfDetected) {
          setError('File is not a PDF.');
          setSource(null);
          return;
        }

        if (file.size === 0) {
          setError('PDF file is empty.');
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
        const normalizedUrl = url.trim();

        if (normalizedUrl.length === 0) {
          setSource(null);
          return;
        }

        if (!isPdfUrl(normalizedUrl)) {
          setError('URL does not point to a PDF.');
          setSource(null);
          return;
        }

        const id = normalizedUrl;

        if (!cancelled) {
          setSource({
            type: 'url',
            id,
            url: normalizedUrl,
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
