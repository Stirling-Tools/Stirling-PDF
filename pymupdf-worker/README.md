# Stirling PDF PyMuPDF Convert

A small, **standalone** CLI tool that converts PDFs to Markdown using
[PyMuPDF](https://pymupdf.io/) (`pymupdf4llm`). It gives Stirling PDF a much
faster PDF→Markdown path than the default `pdftohtml`-based converter.

## License — please read

This tool is licensed under the **GNU Affero General Public License v3.0 or
later (AGPL-3.0-or-later)**. It depends on PyMuPDF, which is dual-licensed under
**AGPL-3.0 or the Artifex commercial license**.

This tool is a **separate program** from the rest of Stirling PDF:

- It shares **no source code** with the MIT core (`app/`) or the proprietary
  engine (`engine/`).
- It is invoked **only as an OS subprocess**.
- Its AGPL copyleft attaches to **this tool only** and does not extend to Stirling
  PDF. Do not replace the subprocess boundary with an in-process `import` of
  PyMuPDF — that separation would be lost.

## Usage

```
pymupdf-convert <input.pdf> <output.md>
```

## Install

```bash
uv sync
uv tool install .
```

Once installed, Stirling PDF auto-detects `pymupdf-convert` on PATH at startup
and uses it automatically, falling back to the bundled `pdftohtml` converter if
it is not found.
