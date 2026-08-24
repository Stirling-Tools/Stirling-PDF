#!/usr/bin/env python3
"""Generate the low-confidence classification test PDF.

The document is engineered so the browser-side heuristic returns confidence
"low": contract-flavoured and invoice-flavoured signals of near-identical
weight, so no single label wins by enough to be trusted.

  contract 57  vs  invoice 55   ->  margin 1

"low" is guaranteed by the MARGIN, not the score: the engine needs margin >= 8
for "medium" and >= 15 for "high", and >= 18 total to emit anything at all.
This document sits 39 points above the floor and 7 below the medium bar, so it
stays "low" even if text extraction wobbles slightly.

Dependency-free: writes raw PDF (uncompressed) so the text is trivially
extractable by pdf.js.
"""

import zlib
from pathlib import Path

TITLE = "Summary Document"
LINES = [
    "The parties hereto acknowledge the position set out below.",
    "Term and termination provisions apply.",
    "Hereinafter referred to as the Supplier.",
    "Amount due: 1,250.00",
    "Payment terms apply.",
    "Total payable: 1,250.00",
    "Balance due: 1,250.00",
    "This document has been prepared for internal review.",
    "Please retain a copy for your records.",
    "Reference: SD-2024-0417.",
    "Prepared by the operations team on 17 April 2024.",
]

OUT = Path(__file__).resolve().parents[1] / "low-confidence-classification-test.pdf"
if len(__import__("sys").argv) > 1:
    OUT = Path(__import__("sys").argv[1])


def escape(s: str) -> str:
    return s.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


def content_stream() -> bytes:
    parts = ["BT", "/F1 20 Tf", "72 720 Td", f"({escape(TITLE)}) Tj", "ET"]
    y = 680
    for line in LINES:
        parts += ["BT", "/F1 12 Tf", f"72 {y} Td", f"({escape(line)}) Tj", "ET"]
        y -= 22
    return "\n".join(parts).encode("latin-1")


def build() -> bytes:
    stream = content_stream()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Title (Summary Document) /Producer (Stirling-PDF classification test fixture) >>",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"

    xref_at = len(out)
    n = len(objects) + 1
    out += f"xref\n0 {n}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets[1:]:
        out += f"{off:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {n} /Root 1 0 R /Info 6 0 R >>\nstartxref\n{xref_at}\n%%EOF\n"
    ).encode()
    return bytes(out)


if __name__ == "__main__":
    data = build()
    OUT.write_bytes(data)
    print(f"wrote {OUT} ({len(data)} bytes)")
    # Sanity: the raw text must be present uncompressed for extraction.
    assert b"parties hereto" in data
    assert zlib.crc32(data) != 0
    print("text present uncompressed: OK")
