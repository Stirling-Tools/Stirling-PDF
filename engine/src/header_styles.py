from __future__ import annotations

# Shared header component CSS injected via {{HEADER_CSS}}.
# Includes both the base header (top-bar, doc-header, doc-title, doc-subtitle)
# and the number-badge variant (doc-number-area, doc-number-label, doc-number)
# used by invoice, receipt, quote, and price-sheet templates.
SHARED_HEADER_CSS = """
    /* ── Top accent bar ── */
    .top-bar {
      height: 3pt;
      background: var(--theme-accent, #2563eb);
      margin-bottom: 10pt;
    }

    /* ── Header (logo left, title centred) ── */
    .doc-header {
      display: flex;
      align-items: center;
      gap: 12pt;
      margin-bottom: 8pt;
    }
    .doc-header-text {
      flex: 1;
      text-align: center;
    }
    .doc-header .company-logo { flex-shrink: 0; }

    .doc-title {
      font-size: 16pt;
      font-weight: 700;
      color: var(--theme-primary, #1e3a5f);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 3pt;
    }

    .doc-subtitle {
      font-size: 9pt;
      color: var(--theme-text-muted, #6b7280);
    }

    /* Number badge variant (invoice, receipt, quote, price sheet) */
    .doc-number-area {
      text-align: right;
      flex-shrink: 0;
    }

    .doc-number-label {
      font-size: 7.5pt;
      color: var(--theme-text-muted, #6b7280);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 2pt;
    }

    .doc-number {
      font-size: 11pt;
      font-weight: 700;
      color: var(--theme-primary, #1e3a5f);
    }"""


# CSS-only header layout — works for every template regardless of whether it uses
# {{HEADER_CSS}}.  Injected as a <style> block into <head> so it takes effect
# before the first paint and needs no JS execution.
#
# Rules (specificity beats any plain .doc-header-text rule via :has()):
#   title only            → centre
#   title + number        → title left, number right
#   logo + title          → both left, packed together
#   logo + title + number → space-between
_HEADER_LAYOUT_CSS = """<style id="docgen-header-layout">
  .doc-header-text { flex: 1; text-align: center; }
  .doc-header:has(.doc-number-area) .doc-header-text { text-align: left; }
  .doc-header:has(img.company-logo) { justify-content: flex-start; }
  .doc-header:has(img.company-logo) .doc-header-text { text-align: left; flex: 0 0 auto; }
  .doc-header:has(img.company-logo):has(.doc-number-area) { justify-content: space-between; }
  .doc-header:has(img.company-logo):has(.doc-number-area) .doc-header-text { text-align: center; flex: 1; }
</style>"""


def inject_header_css(html_content: str) -> str:
    """Replace {{HEADER_CSS}} with the shared header component CSS.

    Templates that use the standard document header include this placeholder
    in their <style> block instead of copy-pasting the CSS.  Templates with
    unique headers (resume, letter, etc.) simply omit it.
    """
    if "{{HEADER_CSS}}" in html_content:
        return html_content.replace("{{HEADER_CSS}}", SHARED_HEADER_CSS)
    return html_content


def inject_header_layout(html: str) -> str:
    """Inject CSS that sets doc-header layout based on which children are present."""
    if not html:
        return html
    if "</head>" in html:
        return html.replace("</head>", f"{_HEADER_LAYOUT_CSS}\n</head>", 1)
    if "</body>" in html:
        return html.replace("</body>", f"{_HEADER_LAYOUT_CSS}\n</body>", 1)
    return html + _HEADER_LAYOUT_CSS


__all__ = [
    "SHARED_HEADER_CSS",
    "inject_header_css",
    "inject_header_layout",
]
