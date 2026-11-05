#!/usr/bin/env python3
"""Generate signed-sample.pdf: a 1-page PDF carrying a digital-signature field.

PDFium's FPDF_GetSignatureCount counts AcroForm fields of /FT /Sig that have a
/V signature dictionary, so the editor's pre-save warning can flag it. The
signature bytes are a placeholder - the point is detection, not validity.
"""
import struct  # noqa: F401  (kept for parity with sibling generators)


def build() -> bytes:
    objs: list[bytes] = []

    # 1: Catalog with an AcroForm referencing the signature field.
    objs.append(
        b"<< /Type /Catalog /Pages 2 0 R "
        b"/AcroForm << /Fields [5 0 R] /SigFlags 3 >> >>"
    )
    # 2: Pages
    objs.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    # 3: Page (the widget annotation is the signature field itself)
    objs.append(
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << >> /Contents 4 0 R /Annots [5 0 R] >>"
    )
    # 4: empty content stream
    stream = b"BT /F1 12 Tf 72 720 Td (Signed sample) Tj ET"
    objs.append(
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"
    )
    # 5: signature field + widget annotation
    objs.append(
        b"<< /FT /Sig /Type /Annot /Subtype /Widget /T (Signature1) "
        b"/Rect [72 700 272 740] /P 3 0 R /V 6 0 R /F 132 >>"
    )
    # 6: signature dictionary
    objs.append(
        b"<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached "
        b"/Name (Test Signer) /M (D:20260101000000Z) "
        b"/ByteRange [0 0 0 0] /Contents <0000> >>"
    )

    header = b"%PDF-1.6\n%\xe2\xe3\xcf\xd3\n"
    out = bytearray(header)
    offsets: list[int] = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += str(i).encode() + b" 0 obj\n" + body + b"\nendobj\n"

    xref_pos = len(out)
    n = len(objs) + 1
    out += b"xref\n0 " + str(n).encode() + b"\n"
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += ("%010d 00000 n \n" % off).encode()
    out += (
        b"trailer\n<< /Size " + str(n).encode() + b" /Root 1 0 R >>\n"
        b"startxref\n" + str(xref_pos).encode() + b"\n%%EOF"
    )
    return bytes(out)


if __name__ == "__main__":
    data = build()
    with open("signed-sample.pdf", "wb") as f:
        f.write(data)
    print(f"wrote signed-sample.pdf ({len(data)} bytes)")
