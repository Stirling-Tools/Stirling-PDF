"""Writes damaged-header.pdf: sample.pdf with a corrupted %PDF header.

PDFium rejects the result as a format error, while lenient parsers such as
PDFBox recover it, which is the case the damaged-file Repair flow exists for.
"""

from pathlib import Path

here = Path(__file__).parent
source = (here / "sample.pdf").read_bytes()
(here / "damaged-header.pdf").write_bytes(b"%PXF" + source[4:])
