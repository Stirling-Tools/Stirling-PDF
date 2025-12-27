from __future__ import annotations

import re
from functools import lru_cache
from typing import List, Optional

ALLOWED_LATEX_PACKAGES = {
    "geometry",
    "xcolor",
    "tabularx",
    "paracol",
    "multicol",
    "longtable",
    "setspace",
    "enumitem",
    "titlesec",
    "array",
    "inputenc",
    "fontenc",
    "tikz",
}


def _strip_body_content(body: str) -> str:
    """
    Remove user data while keeping layout/structure commands.
    Keeps \begin/\end blocks, command scaffolding, and drops plain text.
    """
    lines: List[str] = []
    for line in body.splitlines():
        stripped = line.strip()
        if not stripped:
            lines.append("")
            continue
        if stripped.startswith("%"):
            continue
        if "\\begin" in stripped or "\\end" in stripped:
            lines.append(line)
            continue
        if stripped.startswith("\\"):
            line_no_comments = line.split("%", 1)[0]
            line_sections = re.sub(
                r"(\\(?:section|subsection|subsubsection|paragraph|subparagraph|chapter|part)\*?)\{[^}]*\}",
                r"\\1{}",
                line_no_comments,
            )
            line_items = re.sub(r"^\\item.*", r"\\item {}", line_sections)
            line_text_cmds = re.sub(
                r"\\text(?:bf|it|tt|sc|sf|normal|emph)\{[^}]*\}",
                lambda match: match.group(0).split("{")[0] + "{}",
                line_items,
            )
            cleaned = re.sub(r"(?<!\\)[A-Za-z][A-Za-z0-9 ,.;:'\"!?-]*", "", line_text_cmds).strip()
            if cleaned:
                lines.append(cleaned)
            continue
        cleaned = re.sub(r"[A-Za-z0-9]+", "", line).strip()
        if cleaned:
            lines.append(cleaned)
    return "\n".join(lines)


def extract_layout_hint(latex_code: str, max_chars: Optional[int] = None) -> str:
    """Keep layout-defining LaTeX while stripping user text."""
    if not latex_code:
        return ""

    preamble, body = "", latex_code
    split_doc = latex_code.split(r"\begin{document}", 1)
    if len(split_doc) == 2:
        preamble, body = split_doc
    sanitized_body = _strip_body_content(body)

    hint = f"{preamble}\n% --- layout only (data stripped) ---\n{sanitized_body}"
    return hint if max_chars is None else hint[:max_chars]


@lru_cache(maxsize=64)
def _word_to_int(word: str) -> Optional[int]:
    """Convert simple English number words to int (0-100)."""
    words = {
        "zero": 0,
        "one": 1,
        "two": 2,
        "three": 3,
        "four": 4,
        "five": 5,
        "six": 6,
        "seven": 7,
        "eight": 8,
        "nine": 9,
        "ten": 10,
        "twenty": 20,
        "thirty": 30,
        "forty": 40,
        "fifty": 50,
        "sixty": 60,
        "seventy": 70,
        "eighty": 80,
        "ninety": 90,
        "hundred": 100,
    }
    return words.get(word.strip().lower())


def _sanitize_color_mix(match: re.Match[str]) -> str:
    token = match.group(1)
    if token.isdigit():
        val = int(token)
    else:
        converted = _word_to_int(token)
        if converted is None:
            digits = "".join(ch for ch in token if ch.isdigit())
            val = int(digits) if digits else 80
        else:
            val = converted
    val = max(0, min(100, val))
    return f"!{val}!"


def sanitize_latex(latex_code: str) -> str:
    """Normalize invalid xcolor syntax like '!eighty!' to '!80!'."""
    if not latex_code:
        return latex_code
    return re.sub(r"!\s*([A-Za-z0-9]+)\s*!", _sanitize_color_mix, latex_code)


def strip_missing_packages(latex_code: str) -> str:
    """Remove packages unavailable in the runtime environment."""
    if not latex_code:
        return latex_code
    code = latex_code
    code = re.sub(r"^\\usepackage\{siunitx\}\s*$", "", code, flags=re.MULTILINE)
    code = re.sub(r"\\sisetup\{[^}]*\}", "", code, flags=re.DOTALL)
    code = re.sub(r"\\num\{([^}]*)\}", r"\\1", code)
    code = re.sub(
        r"^\\(setmainfont|setsansfont|setmonofont|newfontfamily)\b.*$",
        "",
        code,
        flags=re.MULTILINE,
    )

    def _filter_packages(match: re.Match[str]) -> str:
        options = match.group(1) or ""
        packages = [pkg.strip() for pkg in match.group(2).split(",") if pkg.strip()]
        allowed = [pkg for pkg in packages if pkg in ALLOWED_LATEX_PACKAGES]
        if not allowed:
            return ""
        return f"\\usepackage{options}{{{', '.join(allowed)}}}"

    return re.sub(
        r"^\\usepackage(\[[^\]]*\])?\{([^}]*)\}\s*$",
        _filter_packages,
        code,
        flags=re.MULTILINE,
    )


def remove_leading_pagebreaks(latex_code: str) -> str:
    """Strip explicit page breaks at the start of the document body."""
    if not latex_code:
        return latex_code
    parts = latex_code.split(r"\begin{document}", 1)
    if len(parts) == 2:
        preamble, body = parts
        cleaned_body = re.sub(
            r"^\s*(\\(newpage|clearpage|pagebreak|vfill)\b\s*)+",
            "\n",
            body,
            flags=re.IGNORECASE | re.MULTILINE,
        )
        return f"{preamble}\\begin{{document}}{cleaned_body}"
    return re.sub(
        r"^\s*(\\(newpage|clearpage|pagebreak|vfill)\b\s*)+",
        "\n",
        latex_code,
        flags=re.IGNORECASE | re.MULTILINE,
    )


def strip_leading_pagebreaks(latex_code: str) -> str:
    """Drop accidental leading page breaks that cause empty first pages."""
    if not latex_code:
        return latex_code
    parts = latex_code.split(r"\begin{document}", 1)
    if len(parts) == 2:
        preamble, body = parts
        cleaned_body = re.sub(
            r"^\s*(\\clearpage|\\newpage|\\pagebreak|\\vfill)+\s*",
            "",
            body,
            flags=re.MULTILINE,
        )
        return f"{preamble}\\begin{{document}}{cleaned_body}"
    return re.sub(
        r"^\s*(\\clearpage|\\newpage|\\pagebreak|\\vfill)+\s*",
        "",
        latex_code,
        flags=re.MULTILINE,
    )


def fix_tabular_row_endings(latex_code: str) -> str:
    """Ensure tabular environments close rows before \\end{tabular}."""
    pattern = re.compile(r"(&[^\n]*)\n\\end{tabular}", re.MULTILINE)
    return pattern.sub(r"\\1 \\\\ \n\\end{tabular}", latex_code)

def strip_placeholder_rules(latex_code: str) -> str:
    """Remove placeholder boxes like \\rule/\\colorbox used as fake images."""
    code = re.sub(r"\\rule\s*\{\s*[\d\.]+[a-zA-Z]*\s*\}\s*\{\s*[\d\.]+[a-zA-Z]*\s*\}", "", latex_code)
    code = re.sub(r"\\fcolorbox\{[^}]*\}\{[^}]*\}\{[^}]*\}", "", code)
    code = re.sub(r"\\colorbox\{[^}]*\}\{[^}]*\}", "", code)
    # Strip simple tikz pictures that are just boxes/fills
    code = re.sub(
        r"\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}",
        "",
        code,
        flags=re.MULTILINE,
    )
    return code


def strip_number_grouping_junk(latex_code: str) -> str:
    """Remove stray siunitx options text that may leak into the document body."""
    if not latex_code:
        return latex_code
    # Drop standalone lines/paragraphs that look like siunitx option lists (common when chunks split)
    return re.sub(
        r"(?im)^\s*,\s*(group-minimum-digits|detect-all|table-number-alignment|round-mode|round-precision)\b.*$",
        "",
        latex_code,
    )


def rebalance_invoice_tables(latex_code: str) -> str:
    """Use wrapped columns for common invoice tables to avoid overflow."""
    if not latex_code:
        return latex_code

    # Legacy 4-col invoices (Item, Desc, Price, Total)
    code = latex_code.replace(
        r"\\begin{tabularx}{\\textwidth}{@{}l l r r@{}}",
        r"\\begin{tabularx}{\\textwidth}{@{}>{\\raggedright\\arraybackslash}p{0.30\\textwidth}>{\\raggedright\\arraybackslash}X>{\\raggedleft\\arraybackslash}p{1.5cm}>{\\raggedleft\\arraybackslash}p{2.3cm}@{}}",
    )

    # Current 5-col invoices (Item, Description, Qty, Unit, Line Total)
    wrapped_invoice_five = (
        r"@{}"
        r">{\\raggedright\\arraybackslash}p{0.16\\textwidth}"
        r">{\\raggedright\\arraybackslash}p{0.50\\textwidth}"
        r">{\\raggedleft\\arraybackslash}p{0.09\\textwidth}"
        r">{\\raggedleft\\arraybackslash}p{0.12\\textwidth}"
        r">{\\raggedleft\\arraybackslash}p{0.13\\textwidth}"
        r"@{}"
    )

    five_col_patterns = [
        (
            # tabularx with first col l/c, X desc, then three p{} numeric cols (matches default invoice template)
            r"(\\begin{tabularx}\{\s*\\textwidth\s*\}\{)\s*@?\{\}?\s*[cl]\s+X\s+p\{[^}]+\}\s+p\{[^}]+\}\s+p\{[^}]+\}\s*@?\{\}?\s*(\})",
            r"\1" + wrapped_invoice_five + r"\2",
        ),
        (
            # longtable version of the same layout (after upgrades)
            r"(\\begin{longtable}\{)\s*@?\{\}?\s*[cl]\s+X\s+p\{[^}]+\}\s+p\{[^}]+\}\s+p\{[^}]+\}\s*@?\{\}?\s*(\})",
            r"\1" + wrapped_invoice_five + r"\2",
        ),
    ]

    for pattern, replacement in five_col_patterns:
        code = re.sub(pattern, replacement, code, flags=re.IGNORECASE)

    return code


def normalize_tabular_like_begins(latex_code: str) -> str:
    """
    Fix common malformed tabular/tabularx/longtable begins where the colspec
    is not passed as a braced argument (e.g. `\\begin{tabularx}\\textwidth{...}`
    or `\\begin{tabularx}{\\textwidth}\\ItemsColSpec`).
    """
    if not latex_code:
        return latex_code

    code = latex_code

    # \begin{tabularx}\textwidth{...} -> \begin{tabularx}{\textwidth}{...}
    code = re.sub(
        r"\\begin{tabularx}\s*\\textwidth\s*\{([^}]*)\}",
        lambda m: f"\\begin{{tabularx}}{{\\textwidth}}{{{m.group(1).strip()}}}",
        code,
    )

    # \begin{tabularx}{\textwidth}\ItemsColSpec -> wrap colspec in braces
    code = re.sub(
        r"\\begin{tabularx}\s*\{\s*\\textwidth\s*\}\s*\\([A-Za-z@][\w@]*)",
        lambda m: f"\\begin{{tabularx}}{{\\textwidth}}{{\\{m.group(1)}}}",
        code,
    )

    # \begin{tabularx}{\textwidth}\colspecliteral -> wrap literal spec
    code = re.sub(
        r"\\begin{tabularx}\s*\{\s*\\textwidth\s*\}\s*([@A-Za-z].*)",
        lambda m: f"\\begin{{tabularx}}{{\\textwidth}}{{{m.group(1).strip()}}}",
        code,
    )

    # \begin{tabular}\colspecliteral  OR  \begin{longtable}\colspecliteral
    def _wrap_simple(env: str, text: str) -> str:
        return re.sub(
            rf"\\begin{{{env}}}\s*([@A-Za-z].*)",
            lambda m: f"\\begin{{{env}}}{{{m.group(1).strip()}}}",
            text,
        )

    code = _wrap_simple("tabular", code)
    code = _wrap_simple("longtable", code)
    return code


def ensure_longtable_support(latex_code: str) -> str:
    """
    Guarantee longtable availability and default centering.

    - Injects \\usepackage{longtable} if missing.
    - Sets \\LTleft/\\LTright to 0pt so longtable spans the text width without manual centering.
    """
    if not latex_code:
        return latex_code

    code = latex_code
    if r"\usepackage{longtable}" not in code:
        code = re.sub(
            r"(\\documentclass[^\n]*\n)",
            r"\1\\usepackage{longtable}\n",
            code,
            count=1,
        )
    if r"\setlength\LTleft" not in code:
        # Use a lambda so backslashes are treated literally (avoid \L escape errors).
        code = re.sub(
            r"(\\usepackage\{longtable\}[^\n]*\n)",
            lambda m: f"{m.group(1)}\\setlength\\LTleft{{0pt}}\n\\setlength\\LTright{{0pt}}\n",
            code,
            count=1,
        )
    return code


def _normalize_alignment_to_wrapped_columns(spec: str) -> str:
    """
    Convert simple l/c/r specs to wrapped p-columns that respect text width.
    Keeps existing p/m/b/X columns unchanged.
    """
    if re.search(r"[pmb]\{|\bX\b", spec):
        return spec

    cols = [ch for ch in spec if ch in ("l", "c", "r")]
    if not cols:
        return spec

    width = max(0.05, min(0.98, 0.98 / len(cols)))
    parts: List[str] = []
    for ch in cols:
        if ch == "r":
            parts.append(r">{\raggedleft\arraybackslash}p{" + f"{width:.3f}\\textwidth" + "}")
        else:
            parts.append(r">{\raggedright\arraybackslash}p{" + f"{width:.3f}\\textwidth" + "}")
    return "@{}" + "".join(parts) + "@{}"


def upgrade_tabular_tables_to_longtable(latex_code: str) -> str:
    """
    Replace table+tabular blocks with longtable so large tables break across pages,
    stay centered, and repeat headers on each page.
    """
    if not latex_code:
        return latex_code

    pattern = re.compile(
        r"\\begin{table}.*?\\begin{tabular}\{([^}]*)\}(.*?)\\end{tabular}.*?\\end{table}",
        re.DOTALL,
    )

    def _build_longtable(match: re.Match[str]) -> str:
        align_spec = match.group(1)
        body = match.group(2).strip()
        normalized_spec = _normalize_alignment_to_wrapped_columns(align_spec)

        header_block = ""
        body_block = body

        hline_split = re.split(r"\\hline", body, maxsplit=1)
        if len(hline_split) == 2:
            header_block = hline_split[0].strip() + r"\\\hline"
            body_block = hline_split[1].lstrip()
        else:
            first_row_split = re.split(r"\\\\", body, maxsplit=1)
            header_block = (first_row_split[0].strip() + r"\\") if first_row_split else ""
            body_block = first_row_split[1].lstrip() if len(first_row_split) == 2 else body

        header_block = header_block.strip()
        body_block = body_block.strip()

        return (
            "\n\\setlength\\LTleft{0pt}\n"
            "\\setlength\\LTright{0pt}\n"
            f"\\begin{{longtable}}{{{normalized_spec}}}\n"
            f"{header_block}\n"
            "\\endfirsthead\n"
            f"{header_block}\n"
            "\\endhead\n"
            f"{body_block}\n"
            "\\end{longtable}\n"
        )

    return pattern.sub(_build_longtable, latex_code)


def clean_generated_latex(latex_code: str) -> str:
    """Apply all sanitizers used both for compilation and template storage."""
    return rebalance_invoice_tables(
        upgrade_tabular_tables_to_longtable(
            ensure_longtable_support(
                normalize_tabular_like_begins(
                    strip_placeholder_rules(
                        strip_number_grouping_junk(
                            fix_tabular_row_endings(
                                strip_leading_pagebreaks(
                                    remove_leading_pagebreaks(
                                        strip_missing_packages(
                                            sanitize_latex(
                                                ensure_full_latex_document(latex_code)
                                            )
                                        )
                                    )
                                )
                            )
                        )
                    )
                )
            )
        )
    )


def ensure_full_latex_document(text: str) -> str:
    """Trim output to a single LaTeX document starting at \\documentclass and ending at \\end{document}."""
    if not text:
        return text
    start = text.find(r"\documentclass")
    end = text.rfind(r"\end{document}")
    if start == -1 or end == -1:
        return text
    end += len(r"\end{document}")
    return text[start:end]


__all__ = [
    "extract_layout_hint",
    "sanitize_latex",
    "strip_missing_packages",
    "remove_leading_pagebreaks",
    "strip_leading_pagebreaks",
    "fix_tabular_row_endings",
    "rebalance_invoice_tables",
    "clean_generated_latex",
    "ensure_full_latex_document",
]
