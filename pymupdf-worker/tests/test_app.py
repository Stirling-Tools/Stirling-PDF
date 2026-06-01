from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pymupdf
import pytest


def _make_pdf(tmp_path: Path, text: str = "Hello Stirling") -> Path:
    pdf_path = tmp_path / "input.pdf"
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), text)
    doc.save(str(pdf_path))
    doc.close()
    return pdf_path


def test_convert_produces_markdown(tmp_path: Path) -> None:
    pdf_path = _make_pdf(tmp_path)
    output_path = tmp_path / "output.md"

    result = subprocess.run(
        [sys.executable, "-m", "pymupdf_worker.convert", str(pdf_path), str(output_path)],
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert output_path.exists()
    assert "Hello Stirling" in output_path.read_text(encoding="utf-8")


def test_missing_input_exits_nonzero(tmp_path: Path) -> None:
    output_path = tmp_path / "output.md"
    result = subprocess.run(
        [sys.executable, "-m", "pymupdf_worker.convert", str(tmp_path / "nope.pdf"), str(output_path)],
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0


def test_wrong_arg_count_exits_nonzero() -> None:
    result = subprocess.run(
        [sys.executable, "-m", "pymupdf_worker.convert"],
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
