# Writes an N-page PDF of uncompressed random RGB images (does not compress).
import os, sys
out, pages, side = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
objs = []
def add(b): objs.append(b); return len(objs)
kids = []
pages_id = None
page_ids = []
# reserve catalog=1, pages=2
objs.append(None); objs.append(None)
for i in range(pages):
    data = os.urandom(side*side*3)
    img = add(b"<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length %d >>\nstream\n" % (side, side, len(data)) + data + b"\nendstream")
    content = b"q 595 0 0 842 0 0 cm /Im0 Do Q"
    c = add(b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream")
    p = add(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 %d 0 R >> >> /Contents %d 0 R >>" % (img, c))
    page_ids.append(p)
objs[0] = b"<< /Type /Catalog /Pages 2 0 R >>"
objs[1] = b"<< /Type /Pages /Count %d /Kids [%s] >>" % (pages, b" ".join(b"%d 0 R" % p for p in page_ids))
with open(out, "wb") as f:
    f.write(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
    offs = []
    for i, o in enumerate(objs, 1):
        offs.append(f.tell()); f.write(b"%d 0 obj\n" % i + o + b"\nendobj\n")
    x = f.tell()
    f.write(b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs)+1))
    for o in offs: f.write(b"%010d 00000 n \n" % o)
    f.write(b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs)+1, x))
