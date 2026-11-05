# Writes an N-page PDF of plain Helvetica text lines (many small objects); pass "flate" to deflate the content streams.
import sys, zlib
out, pages = sys.argv[1], int(sys.argv[2])
flate = len(sys.argv) > 3 and sys.argv[3] == "flate"
objs = [b"<< /Type /Catalog /Pages 2 0 R >>", None, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
kids = []
for p in range(pages):
    body = b"".join(b"BT /F1 9 Tf 40 %d Td (Page %d line %d lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod) Tj ET\n" % (800 - 14 * l, p, l) for l in range(55))
    if flate:
        body = zlib.compress(body, 9)
        objs.append(b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(body) + body + b"\nendstream")
    else:
        objs.append(b"<< /Length %d >>\nstream\n" % len(body) + body + b"\nendstream")
    objs.append(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents %d 0 R >>" % len(objs))
    kids.append(len(objs))
objs[1] = b"<< /Type /Pages /Count %d /Kids [%s] >>" % (pages, b" ".join(b"%d 0 R" % k for k in kids))
with open(out, "wb") as f:
    f.write(b"%PDF-1.7\n")
    offs = []
    for i, o in enumerate(objs, 1):
        offs.append(f.tell()); f.write(b"%d 0 obj\n" % i + o + b"\nendobj\n")
    x = f.tell()
    f.write(b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1))
    for o in offs: f.write(b"%010d 00000 n \n" % o)
    f.write(b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, x))
