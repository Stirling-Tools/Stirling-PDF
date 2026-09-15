#!/usr/bin/env python3
"""Generate one input file per failure kind that an input file can actually cause.

Each file is named for the error code it provokes and the kind that claims it, so a manual pass
can work straight down the directory listing. Run from anywhere:

    python3 testing/failure-fixtures/generate.py

Codes with no file to make (a missing document, a missing binary on the server) are listed in
README.md instead, with the steps to reach them.
"""

import pathlib
import zipfile

OUT = pathlib.Path(__file__).parent / "files"

# A minimal PDF whose page tree is empty. Written by hand because every library refuses to
# produce one: zero pages is exactly the thing they validate against.
NO_PAGES_PDF = b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [] /Count 0 >>
endobj
xref
0 3
0000000000 65535 f
0000000009 00000 n
0000000063 00000 n
trailer
<< /Size 3 /Root 1 0 R >>
startxref
124
%%EOF
"""

# A one-page PDF, truncated mid-object: the header still says PDF, so it is read and then fails.
TRUNCATED_PDF = b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Conte"""

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def write(name: str, data: bytes) -> None:
    path = OUT / name
    path.write_bytes(data)
    print(f"  {name:<46} {len(data):>7} bytes")


def zip_of(entries: dict[str, bytes]) -> bytes:
    import io

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for entry, data in entries.items():
            archive.writestr(entry, data)
    return buffer.getvalue()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for stale in OUT.iterdir():
        stale.unlink()

    print("INPUT_WRONG_TYPE: the file is not the format the step requires")
    write("E006-wrong-type-not-a-pdf.pdf", b"This is plain text wearing a .pdf extension.\n")
    write("E014-wrong-type-not-a-cbr.cbr", b"This is plain text wearing a .cbr extension.\n")
    write("E018-wrong-type-not-a-cbz.cbz", b"This is plain text wearing a .cbz extension.\n")
    write("E061-wrong-type-not-html.html", TRUNCATED_PDF[:40])

    print("\nINPUT_UNREADABLE: the right format, and still unopenable")
    # Real RAR magic, then nothing a reader can follow.
    write("E010-unreadable-broken-rar.cbr", b"Rar!\x1a\x07\x01\x00" + b"\x00" * 64)
    # Real ZIP magic, then a truncated local file header.
    write("E015-unreadable-broken-zip.cbz", b"PK\x03\x04\x14\x00\x00\x00\x08\x00" + b"\xff" * 32)
    write("E021-unreadable-broken-eml.eml", b"Not: a header\r\nnor a body, and no blank line either")
    write("E034-unreadable-broken-image.png", PNG_MAGIC + b"\x00" * 24)

    print("\nINPUT_EMPTY: opens fine, holds nothing to work on")
    write("E005-empty-pdf-no-pages.pdf", NO_PAGES_PDF)
    write("E016-empty-cbz-no-images.cbz", zip_of({"readme.txt": b"no images in here"}))
    write("E020-empty-eml.eml", b"")
    write("E032-empty-file.pdf", b"")

    print("\nINPUT_CORRUPTED: already shipped, included so the set is complete")
    write("E001-corrupted-truncated.pdf", TRUNCATED_PDF)
    write("E002-corrupted-truncated-sibling.pdf", TRUNCATED_PDF.replace(b"612", b"595"))

    print(f"\nWrote {len(list(OUT.iterdir()))} files to {OUT}")
    print("E012 (CBR with no images) needs a real RAR writer; see README.md.")


if __name__ == "__main__":
    main()
