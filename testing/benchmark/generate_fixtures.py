"""Generate deterministic test documents spanning cost classes and cache tiers.
Writes to fixtures/ (idempotent - skips files that already exist)."""
import io, os, random
import fitz  # pymupdf
from PIL import Image
import numpy as np

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
os.makedirs(OUT, exist_ok=True)
random.seed(1234)
np.random.seed(1234)

WORDS = ("lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor "
         "incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud").split()


def para(n):
    return " ".join(random.choice(WORDS) for _ in range(n))


def noise_jpeg(w, h, quality=85):
    arr = np.random.randint(0, 256, (h, w, 3), dtype=np.uint8)
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def text_pdf(path, pages, lines=45):
    doc = fitz.open()
    for i in range(pages):
        p = doc.new_page(width=595, height=842)
        p.insert_text((50, 50), "Page %d of %d" % (i + 1, pages), fontsize=12)
        y = 80
        for _ in range(lines):
            p.insert_text((50, y), para(11)[:95], fontsize=9)
            y += 16
    doc.save(path, deflate=True)
    doc.close()


def scanned_pdf(path, pages, w=1240, h=1754, quality=80):
    doc = fitz.open()
    for _ in range(pages):
        p = doc.new_page(width=595, height=842)
        p.insert_image(fitz.Rect(0, 0, 595, 842), stream=noise_jpeg(w, h, quality))
    doc.save(path)
    doc.close()


def fat_image_pdf(path, pages, w, h, quality=98):
    doc = fitz.open()
    for _ in range(pages):
        p = doc.new_page(width=595, height=842)
        p.insert_image(fitz.Rect(0, 0, 595, 842), stream=noise_jpeg(w, h, quality))
    doc.save(path)
    doc.close()


def vector_pdf(path, pages, paths_per_page=1400):
    doc = fitz.open()
    for _ in range(pages):
        p = doc.new_page(width=595, height=842)
        sh = p.new_shape()
        for _ in range(paths_per_page):
            x0, y0 = random.uniform(0, 560), random.uniform(0, 800)
            sh.draw_line((x0, y0), (x0 + random.uniform(-40, 40), y0 + random.uniform(-40, 40)))
        sh.finish(color=(0.1, 0.2, 0.7), width=0.4)
        sh.commit()
    doc.save(path, deflate=True)
    doc.close()


def table_pdf(path, pages, rows=34, cols=7):
    doc = fitz.open()
    for _ in range(pages):
        p = doc.new_page(width=595, height=842)
        sh = p.new_shape()
        cw, rh, x0, y0 = 74, 21, 40, 60
        for r in range(rows + 1):
            sh.draw_line((x0, y0 + r * rh), (x0 + cols * cw, y0 + r * rh))
        for c in range(cols + 1):
            sh.draw_line((x0 + c * cw, y0), (x0 + c * cw, y0 + rows * rh))
        sh.finish(color=(0, 0, 0), width=0.5)
        sh.commit()
        for r in range(rows):
            for c in range(cols):
                p.insert_text((x0 + c * cw + 3, y0 + r * rh + 14),
                              str(random.randint(100, 9999)), fontsize=7)
    doc.save(path, deflate=True)
    doc.close()


def mixed_pdf(path, pages):
    doc = fitz.open()
    for i in range(pages):
        p = doc.new_page(width=595, height=842)
        p.insert_text((50, 50), "Mixed page %d" % (i + 1), fontsize=13)
        y = 80
        for _ in range(18):
            p.insert_text((50, y), para(11)[:95], fontsize=9)
            y += 15
        if i % 2 == 0:
            p.insert_image(fitz.Rect(50, 380, 545, 780), stream=noise_jpeg(900, 700, 70))
    doc.save(path)
    doc.close()


def form_pdf(path, pages=20):
    doc = fitz.open()
    for i in range(pages):
        p = doc.new_page(width=595, height=842)
        p.insert_text((50, 50), "Form page %d" % (i + 1), fontsize=13)
        for r in range(8):
            y = 90 + r * 70
            p.insert_text((50, y), "Field %d:" % (r + 1), fontsize=10)
            w = fitz.Widget()
            w.field_name = "f_%d_%d" % (i, r)
            w.field_type = fitz.PDF_WIDGET_TYPE_TEXT
            w.rect = fitz.Rect(140, y - 12, 400, y + 8)
            w.field_value = para(3)[:20]
            p.add_widget(w)
    doc.save(path)
    doc.close()


def many_images_pdf(path, pages=30, per=6):
    doc = fitz.open()
    for _ in range(pages):
        p = doc.new_page(width=595, height=842)
        for k in range(per):
            x = 40 + (k % 3) * 180
            y = 60 + (k // 3) * 380
            p.insert_image(fitz.Rect(x, y, x + 160, y + 340), stream=noise_jpeg(300, 600, 70))
    doc.save(path)
    doc.close()


def tiny_pdf(path):
    doc = fitz.open()
    p = doc.new_page(width=595, height=842)
    p.insert_text((60, 60), "Tiny one-page document.", fontsize=12)
    doc.save(path)
    doc.close()


def image_png(path):
    Image.fromarray(np.random.randint(0, 256, (1200, 900, 3), dtype=np.uint8)).save(path)


def text_assets():
    with open(os.path.join(OUT, "sample.md"), "w") as f:
        f.write("# Title\n\nSome **markdown** with a list:\n\n- one\n- two\n\n" + para(40) + "\n")
    with open(os.path.join(OUT, "sample.html"), "w") as f:
        f.write("<!doctype html><html><head><title>t</title></head><body><h1>Hello</h1><p>"
                + para(40) + "</p></body></html>\n")
    with open(os.path.join(OUT, "sample.svg"), "w") as f:
        f.write('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">'
                '<rect width="400" height="300" fill="#eef"/>'
                '<circle cx="200" cy="150" r="80" fill="#0b6b63"/></svg>\n')


SPECS = [
    ("tiny-1p.pdf", lambda p: tiny_pdf(p)),
    ("text-10p.pdf", lambda p: text_pdf(p, 10)),
    ("text-100p.pdf", lambda p: text_pdf(p, 100)),
    ("text-1000p.pdf", lambda p: text_pdf(p, 1000)),
    ("huge-3000p.pdf", lambda p: text_pdf(p, 3000)),
    ("form-20p.pdf", lambda p: form_pdf(p, 20)),
    ("tables-50p.pdf", lambda p: table_pdf(p, 50)),
    ("vector-40p.pdf", lambda p: vector_pdf(p, 40)),
    ("scanned-5p.pdf", lambda p: scanned_pdf(p, 5)),
    ("scanned-50p.pdf", lambda p: scanned_pdf(p, 50)),
    ("many-imgs-30p.pdf", lambda p: many_images_pdf(p, 30, 6)),
    ("mixed-200p.pdf", lambda p: mixed_pdf(p, 200)),
    ("fat-12p-99mb.pdf", lambda p: fat_image_pdf(p, 12, 2000, 2800)),
    ("fat-3p-110mb.pdf", lambda p: fat_image_pdf(p, 3, 4200, 5900)),
    ("img.png", lambda p: image_png(p)),
]


def main():
    for name, fn in SPECS:
        path = os.path.join(OUT, name)
        if os.path.exists(path):
            print("skip %s" % name)
            continue
        fn(path)
        print("%-22s %8.2f MB" % (name, os.path.getsize(path) / (1024 * 1024)), flush=True)
    text_assets()
    # a valid office file for convert/file/pdf, produced by the container's LibreOffice if missing
    print("note: sample.odt is produced by run.sh via the container's LibreOffice", flush=True)


if __name__ == "__main__":
    main()
