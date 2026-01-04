import re
import shutil
import subprocess
import tempfile
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
TEMPLATE_ROOT = ROOT_DIR / "backend" / "templates"
FRONTEND_PUBLIC = ROOT_DIR / "frontend" / "public" / "templates"
FRONTEND_CATALOG = ROOT_DIR / "frontend" / "src" / "templateCatalog.ts"
TIMEOUT_SEC = 60

LOREM_SENTENCE = (
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt "
    "ut labore et dolore magna aliqua."
)
LOREM_PARAGRAPH = (
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt "
    "ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco "
    "laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in "
    "voluptate velit esse cillum dolore eu fugiat nulla pariatur."
)
LOREM_SHORT = "Lorem ipsum dolor sit amet, consectetur adipiscing elit."

PLACEHOLDER_REPLACEMENTS = {
    "TITLE": "Sample Title",
    "SUBTITLE": "Sample Subtitle",
    "AUTHOR": "Sample Author",
    "AUTHOR_LIST": "Sample Author One, Sample Author Two",
    "AFFILIATIONS": "Sample Organization",
    "ABSTRACT": LOREM_PARAGRAPH,
    "KEYWORDS": "keyword1, keyword2, keyword3, keyword4",
    "INTRODUCTION": LOREM_PARAGRAPH,
    "RELATED_WORK": LOREM_PARAGRAPH,
    "METHODOLOGY": LOREM_PARAGRAPH,
    "RESULTS": LOREM_PARAGRAPH,
    "DISCUSSION": LOREM_PARAGRAPH,
    "CONCLUSION": LOREM_SHORT,
    "REFERENCES": "Doe, J. (2024). Example Reference. Journal of Examples.",
    "MAIN_TEXT": f"{LOREM_PARAGRAPH} {LOREM_PARAGRAPH}",
    "FIGURES_TABLES": "Figure 1: Example chart. Table 1: Summary of results.",
    "REPORT_TITLE": "Business Report",
    "DATE": "2025-01-01",
    "EXEC_SUMMARY": LOREM_PARAGRAPH,
    "BACKGROUND": LOREM_PARAGRAPH,
    "FINDINGS": f"{LOREM_SENTENCE} {LOREM_SENTENCE}",
    "RECOMMENDATIONS": "Recommendation 1: Improve efficiency. Recommendation 2: Reduce costs.",
    "APPENDIX": LOREM_SHORT,
    "NEWSLETTER_TITLE": "Monthly Newsletter",
    "TOP_STORY": LOREM_PARAGRAPH,
    "UPDATES": f"{LOREM_SENTENCE} {LOREM_SENTENCE}",
    "SPOTLIGHT": LOREM_PARAGRAPH,
    "FOOTER": "Contact: info@example.com | 123 Main Street",
    "RECIPE_TITLE": "Sample Recipe",
    "SERVINGS": "Serves 4",
    "TIME": "30 minutes",
    "INGREDIENTS": r"\begin{itemize}\item Ingredient A\item Ingredient B\item Ingredient C\end{itemize}",
    "INSTRUCTIONS": LOREM_PARAGRAPH,
    "NOTES": "Notes and tips: adjust seasoning to taste.",
    "BUSINESS_NAME": "Your Company",
    "BUSINESS_ADDRESS": "123 Main Street, Springfield",
    "BUSINESS_CONTACT": "email@example.com | (555) 555-5555",
    "INVOICE_NUMBER": "INV-001",
    "ISSUE_DATE": "2025-01-01",
    "DUE_DATE": "2025-01-15",
    "CLIENT_NAME": "Client Name",
    "CLIENT_ADDRESS": "456 Client Ave, Metropolis",
    "CLIENT_CONTACT": "client@example.com",
    "LINE_ITEMS": r"Design Services & 8 & 120 & 960 \\ Consulting & 4 & 150 & 600 \\",
    "SUBTOTAL": "1560",
    "TAXES": "124.80",
    "TOTAL": "1684.80",
    "PAYMENT_TERMS": "Net 15",
    "PAYMENT_METHODS": "Bank transfer, credit card",
    "STUDENT_NAME": "Student Name",
    "COURSE_NAME": "Course Name",
    "INSTRUCTOR_NAME": "Instructor Name",
    "ASSIGNMENT_TITLE": "Assignment Title",
    "PROMPT": LOREM_SHORT,
    "RESPONSE": LOREM_PARAGRAPH,
    "CHAPTER_ONE_TITLE": "Chapter One",
    "CHAPTER_ONE": LOREM_PARAGRAPH,
    "CHAPTER_TWO_TITLE": "Chapter Two",
    "CHAPTER_TWO": LOREM_PARAGRAPH,
    "PREFACE": LOREM_SHORT,
    "PUBLISHER": "Publisher",
    "NAME": "Name",
    "EMAIL": "email@example.com",
    "PHONE": "(555) 555-5555",
    "LOCATION": "City, Country",
    "SUMMARY": LOREM_SENTENCE,
    "EXPERIENCE": f"{LOREM_SENTENCE} {LOREM_SENTENCE}",
    "EDUCATION": "University Name, B.S. in Example Studies",
    "SKILLS": "Skills: Analysis, Design, Communication",
    "PROJECTS": LOREM_SHORT,
    "SUBJECT": "Subject",
    "BODY": LOREM_PARAGRAPH,
    "RECIPIENT_NAME": "Recipient Name",
    "RECIPIENT_TITLE": "Recipient Title",
    "RECIPIENT_COMPANY": "Recipient Company",
    "RECIPIENT_ADDRESS": "Recipient Address",
    "SENDER_NAME": "Sender Name",
    "SENDER_ADDRESS": "Sender Address",
    "SENDER_EMAIL": "sender@example.com",
    "MONTH_YEAR": "January 2025",
    "THEME": "Theme",
    "WEEK_ROWS": "1 & 2 & 3 & 4 & 5 & 6 & 7 \\\\\\\\ \\\\hline",
    "HEADLINE": "Headline",
    "SUBTEXT": "Supporting message with a clear benefit.",
    "CALL_TO_ACTION": "Call to action",
    "CONTACT": "contact@example.com",
    "EXPERIMENT_TITLE": "Experiment Title",
    "OBJECTIVE": LOREM_SHORT,
    "MATERIALS": "Materials list goes here.",
    "PROCEDURE": LOREM_PARAGRAPH,
    "OBSERVATIONS": LOREM_SHORT,
    "INSTITUTION": "Institution",
    "PRESENTER": "Presenter",
    "AGENDA": "Agenda goes here.",
    "KEY_POINTS": "Key points go here.",
    "DATA_VISUALS": "Data visuals go here.",
    "SUBTITLE": "Subtitle",
    "ORGANIZATION": "Organization",
}


def render_template_latex(raw_latex: str) -> str:
    def replace(match: re.Match[str]) -> str:
        key = match.group(1).strip()
        return PLACEHOLDER_REPLACEMENTS.get(key, key.replace("_", " ").title())

    return re.sub(r"<<([A-Z0-9_]+)>>", replace, raw_latex)


def find_converter() -> str | None:
    if shutil.which("pdftoppm"):
        return "pdftoppm"
    if shutil.which("magick"):
        return "magick"
    if shutil.which("convert"):
        return "convert"
    return None


def pdf_to_jpg(pdf_path: Path, jpg_path: Path, converter: str) -> None:
    if converter == "pdftoppm":
        subprocess.run(
            ["pdftoppm", "-jpeg", "-f", "1", "-singlefile", str(pdf_path), str(jpg_path.with_suffix(''))],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=TIMEOUT_SEC,
        )
        return
    if converter == "magick":
        subprocess.run(
            ["magick", "convert", "-density", "150", str(pdf_path), "-quality", "90", str(jpg_path)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=TIMEOUT_SEC,
        )
        return
    subprocess.run(
        ["convert", "-density", "150", str(pdf_path), "-quality", "90", str(jpg_path)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=TIMEOUT_SEC,
    )


def main() -> None:
    if not shutil.which("pdflatex"):
        raise SystemExit("pdflatex not found. Install TeX Live or MikTeX to generate thumbnails.")

    converter = find_converter()
    if not converter:
        raise SystemExit("No PDF-to-image converter found. Install poppler-utils or ImageMagick.")

    tex_files = list(TEMPLATE_ROOT.rglob("*.tex"))
    if not tex_files:
        raise SystemExit(f"No templates found in {TEMPLATE_ROOT}")

    FRONTEND_PUBLIC.mkdir(parents=True, exist_ok=True)
    catalog: dict[str, list[str]] = {}

    failures: list[str] = []
    for tex_file in tex_files:
        doc_type = tex_file.parent.name
        template_id = tex_file.stem
        target_dir = FRONTEND_PUBLIC / doc_type
        target_dir.mkdir(parents=True, exist_ok=True)
        target_jpg = target_dir / f"{template_id}.jpg"

        catalog.setdefault(doc_type, [])
        if template_id not in catalog[doc_type]:
            catalog[doc_type].append(template_id)
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            rendered = render_template_latex(tex_file.read_text(encoding="ascii"))
            tmp_tex = tmpdir_path / "template.tex"
            tmp_tex.write_text(rendered, encoding="ascii")

            try:
                subprocess.run(
                    ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", tmp_tex.name],
                    check=True,
                    cwd=tmpdir_path,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=TIMEOUT_SEC,
                )
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
                failures.append(f"{tex_file}: pdflatex failed ({exc})")
                continue

            pdf_path = tmpdir_path / "template.pdf"
            if not pdf_path.exists():
                failures.append(f"{tex_file}: PDF not generated")
                continue

            try:
                pdf_to_jpg(pdf_path, target_jpg, converter)
                print(f"Wrote {target_jpg}")
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
                failures.append(f"{tex_file}: image conversion failed ({exc})")
                continue

    if failures:
        print("\nFailures:")
        for failure in failures:
            print(f"- {failure}")
        raise SystemExit("Template thumbnail generation completed with errors.")

    entries = []
    for doc_type in sorted(catalog.keys()):
        templates = sorted(catalog[doc_type])
        if "default" in templates:
            templates = ["default"] + [t for t in templates if t != "default"]
        entries.append(
            f"  {{ docType: '{doc_type}', templateCount: {len(templates)}, templates: {templates} }}"
        )

    FRONTEND_CATALOG.write_text(
        "// Auto-generated by generate_template_thumbnails.py\n"
        "export type TemplateCatalogEntry = {\n"
        "  docType: string\n"
        "  templateCount: number\n"
        "  templates: string[]\n"
        "}\n\n"
        "export const templateCatalog: TemplateCatalogEntry[] = [\n"
        + ",\n".join(entries)
        + "\n]\n",
        encoding="ascii",
    )
    print(f"Wrote catalog {FRONTEND_CATALOG}")


if __name__ == "__main__":
    main()
