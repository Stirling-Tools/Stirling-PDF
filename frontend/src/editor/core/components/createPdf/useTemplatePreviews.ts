import { useEffect, useState, type RefObject } from "react";
import { generateThumbnailForFile } from "@editor/utils/thumbnailUtils";
import { createPdfFromTemplate, type NewPdfPageSetup, type PdfTemplate } from "@editor/services/createPdf/newPdfDocuments";
import type * as TemplateLibrary from "@editor/services/createPdf/pdfTemplates";

const previewCache = new Map<string, Promise<string>>();

function keyOf(template: PdfTemplate, setup: NewPdfPageSetup) {
  return `${template.id}:${setup.size}:${setup.orientation}`;
}

function previewFor(template: PdfTemplate, setup: NewPdfPageSetup) {
  const key = keyOf(template, setup);
  let preview = previewCache.get(key);
  if (!preview) {
    preview = createPdfFromTemplate(template, setup).then(generateThumbnailForFile);
    preview.catch(() => previewCache.delete(key));
    previewCache.set(key, preview);
  }
  return preview;
}

export function useTemplatePreview(
  template: PdfTemplate,
  setup: NewPdfPageSetup,
  target: RefObject<Element | null>,
): string | null {
  const [preview, setPreview] = useState<{ key: string; url: string } | null>(null);
  const key = keyOf(template, setup);

  useEffect(() => {
    const element = target.current;
    if (!element) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        previewFor(template, setup)
          .then((url) => {
            if (!cancelled) setPreview({ key, url });
          })
          .catch(() => undefined);
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [template, setup, key, target]);

  return preview?.key === key ? preview.url : null;
}

export function usePdfTemplateLibrary(enabled: boolean): typeof TemplateLibrary | null {
  const [library, setLibrary] = useState<typeof TemplateLibrary | null>(null);

  useEffect(() => {
    if (!enabled || library) return;
    let cancelled = false;
    void import("@editor/services/createPdf/pdfTemplates").then((module) => {
      if (!cancelled) setLibrary(module);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, library]);

  return library;
}
