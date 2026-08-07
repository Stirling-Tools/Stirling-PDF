#!/usr/bin/env python3
"""Generate minimal synthetic PDFs for the v2 editor CropBox/rotation tests.

These are hand-authored fixtures (NOT spirit-sx, which must never be committed).
Each has one page with a single Helvetica text object "Hi" at a known user-space
baseline, a MediaBox, and a CropBox whose origin is deliberately offset from the
MediaBox so the editor's display transform is exercised. Run from this dir:

    python generate-cropbox-fixtures.py
"""


def build_pdf(media, crop, rotate, text, tx, ty, font_size=24):
    """Return bytes of a 1-page PDF. media/crop are [x0,y0,x1,y1]; text drawn
    at Td(tx,ty) in user space with Helvetica."""
    objs = []
    objs.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objs.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    page = (
        b"<< /Type /Page /Parent 2 0 R "
        + b"/MediaBox [ %d %d %d %d ] " % tuple(media)
        + b"/CropBox [ %d %d %d %d ] " % tuple(crop)
        + b"/Rotate %d " % rotate
        + b"/Resources << /Font << /F1 5 0 R >> >> "
        + b"/Contents 4 0 R >>"
    )
    objs.append(page)
    stream = (
        b"BT /F1 %d Tf %d %d Td (%s) Tj ET"
        % (font_size, tx, ty, text.encode("ascii"))
    )
    objs.append(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
    objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref_pos = len(out)
    out += b"xref\n0 %d\n" % (len(objs) + 1)
    out += b"0000000000 65535 f \n"
    for off in offsets[1:]:
        out += b"%010d 00000 n \n" % off
    out += (
        b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n"
        % (len(objs) + 1, xref_pos)
    )
    return bytes(out)


def main():
    # (A) Control: CropBox == MediaBox, Rotate 0. Must behave like today.
    open("cropbox-control.pdf", "wb").write(
        build_pdf([0, 0, 400, 400], [0, 0, 400, 400], 0, "Hi", 60, 350)
    )
    # (B) CropBox origin offset (50,30); visible page is 300x350 portrait.
    # Text baseline user-space (60,350) -> display (10,320).
    open("cropbox-offset.pdf", "wb").write(
        build_pdf([0, 0, 400, 400], [50, 30, 350, 380], 0, "Hi", 60, 350)
    )
    # (C) CropBox offset + Rotate 90. Displayed page swaps to 350x300.
    open("cropbox-rotate90.pdf", "wb").write(
        build_pdf([0, 0, 400, 400], [50, 30, 350, 380], 90, "Hi", 60, 350)
    )
    print("wrote cropbox-control.pdf, cropbox-offset.pdf, cropbox-rotate90.pdf")


if __name__ == "__main__":
    main()
