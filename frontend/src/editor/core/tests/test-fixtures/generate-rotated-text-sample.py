#!/usr/bin/env python3
"""Generate rotated-text-sample.pdf: one page with a single text object whose
text matrix is rotated 30 degrees (an OBJECT rotation, not a page /Rotate).

Used to verify the editor preserves a run's rotation when it re-emits the text
on edit (instead of forcing it upright).
"""
import math


def build() -> bytes:
    cos = math.cos(math.radians(30))
    sin = math.sin(math.radians(30))
    stream = (
        f"BT /F1 24 Tf {cos:.5f} {sin:.5f} {-sin:.5f} {cos:.5f} 200 400 Tm "
        f"(Rotated) Tj ET"
    ).encode("ascii")

    objs: list[bytes] = []
    objs.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objs.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    objs.append(
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>"
    )
    objs.append(
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"
    )
    objs.append(
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
    )

    out = bytearray(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
    offsets: list[int] = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += str(i).encode() + b" 0 obj\n" + body + b"\nendobj\n"
    xref_pos = len(out)
    n = len(objs) + 1
    out += b"xref\n0 " + str(n).encode() + b"\n0000000000 65535 f \n"
    for off in offsets:
        out += ("%010d 00000 n \n" % off).encode()
    out += (
        b"trailer\n<< /Size " + str(n).encode() + b" /Root 1 0 R >>\n"
        b"startxref\n" + str(xref_pos).encode() + b"\n%%EOF"
    )
    return bytes(out)


if __name__ == "__main__":
    data = build()
    with open("rotated-text-sample.pdf", "wb") as f:
        f.write(data)
    print(f"wrote rotated-text-sample.pdf ({len(data)} bytes)")
