const SIGN_IN_REQUIRED_ENDPOINTS: ReadonlySet<string> = new Set([
  "file-to-pdf",
  "pdf-to-word",
  "pdf-to-presentation",
  "pdf-to-rtf",
  "pdf-to-html",
  "pdf-to-xml",
  "pdf-to-epub",
  "pdf-to-pdfa",
  "html-to-pdf",
  "url-to-pdf",
  "markdown-to-pdf",
  "eml-to-pdf",
  "ebook-to-pdf",
  "extract-image-scans",
]);

export function requiresSignIn(endpointName: string): boolean {
  return SIGN_IN_REQUIRED_ENDPOINTS.has(endpointName);
}
