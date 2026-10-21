/**
 * Starts a file download without leaving the page. The installer hosts answer
 * with Content-Disposition: attachment, so following the link downloads the
 * file and the current document stays put.
 */
export function startDownload(url: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
