"""Writes sample.cbz and sample.epub from the other sample files.

Each is the smallest archive its format accepts, with fixed timestamps so a
rerun reproduces the same bytes.
"""

import zipfile
from pathlib import Path

here = Path(__file__).parent
EPOCH = (2024, 1, 1, 0, 0, 0)


def add(archive: zipfile.ZipFile, name: str, data: bytes, method: int) -> None:
    info = zipfile.ZipInfo(name, date_time=EPOCH)
    info.compress_type = method
    archive.writestr(info, data)


with zipfile.ZipFile(here / "sample.cbz", "w") as cbz:
    add(cbz, "001.png", (here / "sample.png").read_bytes(), zipfile.ZIP_STORED)
    add(cbz, "002.jpg", (here / "sample.jpg").read_bytes(), zipfile.ZIP_STORED)

CONTAINER = b"""<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"""

PACKAGE = b"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:uuid:00000000-0000-4000-8000-000000000001</dc:identifier>
    <dc:title>Sample</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2024-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter"/>
  </spine>
</package>
"""

NAV = b"""<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Sample</title></head>
  <body>
    <nav epub:type="toc"><ol><li><a href="chapter.xhtml">Chapter 1</a></li></ol></nav>
  </body>
</html>
"""

CHAPTER = b"""<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Chapter 1</title></head>
  <body><h1>Chapter 1</h1><p>This is a test ebook.</p></body>
</html>
"""

with zipfile.ZipFile(here / "sample.epub", "w") as epub:
    # EPUB OCF: the mimetype entry comes first and is stored uncompressed.
    add(epub, "mimetype", b"application/epub+zip", zipfile.ZIP_STORED)
    add(epub, "META-INF/container.xml", CONTAINER, zipfile.ZIP_DEFLATED)
    add(epub, "OEBPS/content.opf", PACKAGE, zipfile.ZIP_DEFLATED)
    add(epub, "OEBPS/nav.xhtml", NAV, zipfile.ZIP_DEFLATED)
    add(epub, "OEBPS/chapter.xhtml", CHAPTER, zipfile.ZIP_DEFLATED)
