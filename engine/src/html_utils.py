from __future__ import annotations

import logging
import re

from bs4 import BeautifulSoup, Tag

from header_styles import (
    SHARED_HEADER_CSS,
    inject_header_css,
    inject_header_layout,
)

logger = logging.getLogger(__name__)


# Single source of truth: (field_name, css_var, default_value).
# To add a new theme property, add one entry here — nothing else needs updating.
_THEME_PROPS: list[tuple[str, str, str]] = [
    ("primary", "--theme-primary", "#1e3a5f"),
    ("accent", "--theme-accent", "#2563eb"),
    ("secondary", "--theme-secondary", "#475569"),
    ("bg", "--theme-bg", "#ffffff"),
    ("surface", "--theme-surface", "#f8fafc"),
    ("border", "--theme-border", "#e2e8f0"),
    ("text", "--theme-text", "#1a1a1a"),
    ("text_muted", "--theme-text-muted", "#6b7280"),
    ("heading", "--theme-heading", "#111827"),
    ("font", "--theme-font", "'Helvetica Neue', Arial, sans-serif"),
    ("font_size_base", "--theme-font-size-base", "10pt"),
    ("font_size_heading", "--theme-font-size-heading", "14pt"),
    ("font_weight_body", "--theme-font-weight-body", "400"),
    ("font_weight_heading", "--theme-font-weight-heading", "700"),
    ("font_weight_bold", "--theme-font-weight-bold", "600"),
    ("line_height", "--theme-line-height", "1.4"),
    ("page_margin", "--theme-page-margin", "20mm"),
]

_FIELD_TO_VAR: dict[str, str] = {field: var for field, var, _ in _THEME_PROPS}
_DEFAULTS: dict[str, str] = {var: default for _, var, default in _THEME_PROPS}

DEFAULT_THEME_CSS: str = ":root {\n" + "\n".join(f"  {var}: {val};" for var, val in _DEFAULTS.items()) + "\n}"


def build_theme_css(overrides: dict[str, str] | None = None) -> str:
    """Build a :root { } block of CSS custom properties with optional overrides."""
    if not overrides:
        return DEFAULT_THEME_CSS
    props = {**_DEFAULTS, **{_FIELD_TO_VAR.get(k, k): v for k, v in overrides.items()}}
    return ":root {\n" + "\n".join(f"  {var}: {val};" for var, val in props.items()) + "\n}"


def inject_theme(html_content: str, theme_overrides: dict[str, str] | None = None) -> str:
    """
    Inject theme CSS variables into an HTML document.

    If the template contains {{THEME_CSS}}, it is replaced with the theme block.
    Otherwise, the style block is injected before </head>.

    A body-level cascade is included so that typography CSS variables take effect
    on existing templates without requiring per-template changes.
    """
    theme_css = build_theme_css(theme_overrides)
    body_cascade = (
        # html background covers edge-to-edge (including @page margin area) because
        # Chrome applies the html element background to the entire page in print.
        # Do NOT zero out @page margins here — body padding only applies to the
        # first/last page, so using it as a substitute for @page margins breaks
        # the top margin on all pages after a page break.
        "html { "
        "background: var(--theme-bg) !important; "
        "-webkit-print-color-adjust: exact !important; "
        "print-color-adjust: exact !important; "
        "} "
        "body { "
        "background: var(--theme-bg) !important; "
        "-webkit-print-color-adjust: exact !important; "
        "print-color-adjust: exact !important; "
        "font-size: var(--theme-font-size-base) !important; "
        "line-height: var(--theme-line-height) !important; "
        "} "
        "h1, .doc-title, .name { color: var(--theme-primary) !important; } "
        "h2, h3, h4, h5, h6, .section-heading { color: var(--theme-primary) !important; } "
        ".party-card-header, .entry-org, .job-title, .sender-company { color: var(--theme-accent) !important; }"
    )
    full_css = f"{theme_css}\n{body_cascade}"

    logger.info("[inject_theme] overrides=%s", theme_overrides)
    logger.info("[inject_theme] full CSS block being injected:\n%s", full_css)

    if "{{THEME_CSS}}" in html_content:
        logger.info("[inject_theme] replacing {{THEME_CSS}} placeholder")
        return html_content.replace("{{THEME_CSS}}", full_css)

    style_tag = f"<style id='docgen-theme'>\n{full_css}\n</style>"
    if "</head>" in html_content:
        logger.info("[inject_theme] injecting <style id='docgen-theme'> before </head>")
        return html_content.replace("</head>", f"{style_tag}\n</head>", 1)

    logger.warning("[inject_theme] no </head> found, appending style tag to end of document")
    return html_content


_EMPTY_SECTION_HIDER_JS = """<script id="docgen-empty-hider">
(function(){
  function isBlank(s){ return !s || !s.replace(/[\\s\\u00a0]/g,''); }

  // 1. Hide meta-label+value pairs where the value is empty
  document.querySelectorAll('.meta-value').forEach(function(v){
    if(isBlank(v.textContent)){
      v.style.display='none';
      var p=v.previousElementSibling;
      if(p && p.classList.contains('meta-label')) p.style.display='none';
    }
  });

  // 2. Remove "Field: " lines with no value from free-text blocks
  var textBlockSel='.text-section,.memo-body,.legal-section-body,.reimbursement-note';
  document.querySelectorAll(textBlockSel).forEach(function(el){
    var lines=el.textContent.split('\\n');
    var filtered=lines.filter(function(l){ return !/^[^:\\n]+:\\s*$/.test(l.trim()); });
    if(filtered.length!==lines.length) el.textContent=filtered.join('\\n').trim();
    if(isBlank(el.textContent)) el.style.display='none';
  });

  // 3. Hide other leaf elements that are empty
  document.querySelectorAll('.party-detail,.opening-para,.deadline-line,.sig-field-label,.text-section').forEach(function(el){
    if(isBlank(el.textContent)) el.style.display='none';
  });

  // 4. Hide tables whose tbody has no rows
  document.querySelectorAll('table tbody').forEach(function(tbody){
    if(!tbody.rows.length){
      var t=tbody.closest('table');
      if(t) t.style.display='none';
    }
  });

  // 5. Hide a section-heading when all following siblings (until the next heading) are hidden or blank
  document.querySelectorAll('.section-heading').forEach(function(h){
    var sib=h.nextElementSibling;
    var ok=false;
    while(sib && !sib.classList.contains('section-heading')){
      if(sib.style.display!=='none' && !isBlank(sib.textContent)){ ok=true; break; }
      sib=sib.nextElementSibling;
    }
    if(!ok) h.style.display='none';
  });
})();
</script>"""


def inject_logo(html: str, logo_base64: str | None) -> str:
    """Inject a company logo into any HTML document.

    Replaces ``{{LOGO_BLOCK}}`` if present. If no placeholder exists, this
    function does nothing — logo placement is controlled by the HTML produced
    by the LLM/template.

    When *logo_base64* is ``None``, the placeholder is removed and templates
    without it are untouched.
    """
    img_html = (
        f'<img class="company-logo" src="{logo_base64}" alt="" '
        'style="max-height:56px;max-width:200px;object-fit:contain;display:block;flex-shrink:0;">'
        if logo_base64
        else ""
    )

    if "{{LOGO_BLOCK}}" in html:
        return html.replace("{{LOGO_BLOCK}}", img_html)

    # If the LLM removes the placeholder during revise, we do NOT force placement.
    # Logo placement is controlled by the LLM/template via `{{LOGO_BLOCK}}`.
    return html


def strip_logo_to_placeholder(html: str) -> str:
    """Replace an injected company-logo ``<img>`` tag with the ``{{LOGO_BLOCK}}`` placeholder.

    This is the inverse of :func:`inject_logo`. It is used before persisting HTML so that
    stored/AI-visible HTML is logo-agnostic — the real image data is re-injected from the
    user's settings at render time rather than stored inline.

    If no ``company-logo`` ``<img>`` tag is found (e.g. the logo was intentionally removed by
    the user), the HTML is returned unchanged.
    """
    soup = BeautifulSoup(html, "html.parser")
    img = soup.find("img", class_="company-logo")
    if not isinstance(img, Tag):
        return html
    img.replace_with("{{LOGO_BLOCK}}")
    return str(soup)


def inject_empty_section_hider(html: str) -> str:
    """
    Inject a trusted JS snippet that hides empty/unfilled sections at render time.
    Must be called AFTER clean_generated_html so it is not stripped by _strip_scripts.
    Works for any HTML doc type — no knowledge of specific templates required.
    """
    if not html:
        return html
    if "</body>" in html:
        return html.replace("</body>", f"{_EMPTY_SECTION_HIDER_JS}\n</body>", 1)
    return html + _EMPTY_SECTION_HIDER_JS


def clean_generated_html(html: str) -> str:
    """Apply sanitisers to AI-generated HTML before passing to Puppeteer."""
    if not html:
        return html

    sanitisers = [
        _remove_markdown_fences,
        _strip_scripts,
        _strip_event_handlers,
        _strip_external_resources,
        _ensure_full_html_document,
    ]
    for fn in sanitisers:
        html = fn(html)

    return html


def extract_html_layout_hint(html_content: str, max_chars: int | None = None) -> str:
    """
    Strip user data from HTML, keeping structure/CSS as a layout hint for the AI.
    Replaces visible text content with placeholder tokens.
    """
    if not html_content:
        return ""

    hint = html_content

    # Replace text content inside common leaf tags with generic placeholder
    hint = re.sub(
        r"(<(?:p|span|td|th|li|h[1-6]|div)[^>]*>)[^<]+(<\/)",
        r"\1CONTENT\2",
        hint,
    )

    # Truncate if needed
    if max_chars is not None:
        hint = hint[:max_chars]

    return hint


# ── Private sanitisers ────────────────────────────────────────────────────────


def _remove_markdown_fences(html: str) -> str:
    html = re.sub(r"^```(?:html)?\s*$", "", html, flags=re.MULTILINE)
    html = re.sub(r"^```\s*$", "", html, flags=re.MULTILINE)
    return html.strip()


def _strip_scripts(html: str) -> str:
    """Remove <script> tags — no executable code in generated docs."""
    return re.sub(
        r"<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>",
        "",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )


def _strip_event_handlers(html: str) -> str:
    """Remove inline event handlers (onclick, onload, etc.)."""
    return re.sub(r'\s+on\w+\s*=\s*(?:"[^"]*"|\'[^\']*\')', "", html, flags=re.IGNORECASE)


def _strip_external_resources(html: str) -> str:
    """Remove <link> tags referencing external (http/https) stylesheets."""
    html = re.sub(
        r'<link[^>]+href\s*=\s*["\']https?://[^"\']+["\'][^>]*>',
        "",
        html,
        flags=re.IGNORECASE,
    )
    # Also remove <img> tags with http/https src (they won't load in file:// anyway)
    html = re.sub(
        r'<img[^>]+src\s*=\s*["\']https?://[^"\']+["\'][^>]*/?>',
        "",
        html,
        flags=re.IGNORECASE,
    )
    return html


def _ensure_full_html_document(html: str) -> str:
    """Trim output to begin at <!DOCTYPE or <html if prefix junk is present."""
    lower = html.lower()
    for marker in ("<!doctype html", "<html"):
        idx = lower.find(marker)
        if idx != -1:
            return html[idx:]
    return html


__all__ = [
    "DEFAULT_THEME_CSS",
    "SHARED_HEADER_CSS",
    "build_theme_css",
    "inject_header_css",
    "inject_theme",
    "inject_logo",
    "strip_logo_to_placeholder",
    "inject_empty_section_hider",
    "inject_header_layout",
    "clean_generated_html",
    "extract_html_layout_hint",
]
