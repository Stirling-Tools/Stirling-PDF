"""Generate weight fixtures for sans, serif and monospaced scanned text.

Requires reportlab, PyMuPDF and Pillow. Run this script to regenerate the
96dpi, blurred 150dpi and crisp 600dpi PDFs beside it. Each scan includes
regular and bold rows; all invisible OCR words name Helvetica-Bold so the
editor cannot use the hidden font metadata to choose the visible weight.
"""

from io import BytesIO
from pathlib import Path

import fitz
from PIL import Image, ImageFilter
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.lib.utils import ImageReader

ROWS = [
    ("Helvetica", "Regular sans Customer Jane Example pays today"),
    ("Helvetica-Bold", "Bold sans Customer Jane Example pays today"),
    ("Times-Roman", "Regular serif Customer Jane Example pays today"),
    ("Times-Bold", "Bold serif Customer Jane Example pays today"),
    ("Courier", "Regular mono Customer Jane Example pays today"),
    ("Courier-Bold", "Bold mono Customer Jane Example pays today"),
]
SIZE = (550, 550)
FONT_SIZE = 14


def build(dpi: int, blur: float = 0) -> bytes:
    source = BytesIO()
    c = canvas.Canvas(source, pagesize=SIZE)
    for i, (family, text) in enumerate(ROWS):
        c.setFont(family, FONT_SIZE)
        c.drawString(35, 505 - i * 80, text)
    c.save()
    with fitz.open(stream=source.getvalue(), filetype="pdf") as doc:
        pix = doc[0].get_pixmap(dpi=dpi, colorspace=fitz.csGRAY)
    image = Image.frombytes("L", (pix.width, pix.height), pix.samples)
    if blur:
        image = image.filter(ImageFilter.GaussianBlur(blur))
    result = BytesIO()
    c = canvas.Canvas(result, pagesize=SIZE)
    c.drawImage(ImageReader(image), 0, 0, *SIZE)
    for i, (family, text) in enumerate(ROWS):
        x = 35
        for word in text.split():
            t = c.beginText(x, 505 - i * 80)
            t.setFont("Helvetica-Bold", FONT_SIZE)
            t.setTextRenderMode(3)
            t.setHorizScale(
                100 * stringWidth(word, family, FONT_SIZE)
                / stringWidth(word, "Helvetica-Bold", FONT_SIZE)
            )
            t.textOut(word)
            c.drawText(t)
            x += stringWidth(word + " ", family, FONT_SIZE)
    c.save()
    return result.getvalue()


if __name__ == "__main__":
    target = Path(__file__).parent
    for dpi, blur in [(96, 0), (150, 0.6), (600, 0)]:
        output = target / f"scanned-ocr-weight-{dpi}.pdf"
        output.write_bytes(build(dpi, blur))
        print(output.name, output.stat().st_size)
