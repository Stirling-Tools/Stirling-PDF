#!/usr/bin/env python3
"""Generate input files that genuinely fail, with the tool each one needs.

Two things decide whether a fixture works, and the first set of these got both wrong:

PDFBox 3 repairs structural damage. A PDF truncated mid-object still has a valid header, so its
xref is rebuilt and the file processes normally. Only bytes it cannot find a header in fail.

The failure depends on the step, not the file. Redact will happily redact a zero-page document;
only content extraction and the comic converters count pages. So each file below names the tool
that raises its code, and the policy under test has to start with that tool.
"""

import pathlib
import zipfile

OUT = pathlib.Path(__file__).parent / "files"

# Deterministic filler, so regenerating does not churn the files. Not random: a fixture that
# differs run to run cannot be compared against a previous failure.
FILLER = bytes((i * 7 + 13) % 256 for i in range(2048))

# Valid, loadable, and holds no pages. PDFBox reads it without complaint, which is the point:
# the failure has to come from a step that asks for pages, not from the parser.
ZERO_PAGE_PDF = b"""%PDF-1.4
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


def write(name: str, data: bytes, note: str) -> None:
    (OUT / name).write_bytes(data)
    print(f"  {name:<44} {len(data):>6}B  {note}")


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

    print("Works with any PDF step (redact, compress, rotate):")
    # No %PDF header anywhere, so there is nothing for PDFBox to rebuild from. This is the one
    # corruption shape confirmed to fail rather than be repaired.
    write(
        "E001-damaged-no-header.pdf",
        b"Not a PDF. No header, nothing to rebuild from.\n" + FILLER,
        "Damaged document",
    )
    # Header present, then bytes holding no object PDFBox can recover.
    write(
        "E001-damaged-garbage-body.pdf",
        b"%PDF-1.7\n" + FILLER,
        "Damaged document",
    )
    write("E032-empty.pdf", b"", "Empty file")

    print("\nNeeds a step that counts pages (extract content, PDF to CBZ, PDF to CBR):")
    write("E005-zero-pages.pdf", ZERO_PAGE_PDF, "Empty file")

    print("\nNeeds a compliance or PDF/A step, which refuse an empty input by type:")
    write("E006-empty-for-compliance.pdf", b"", "Wrong file type")

    print("\nNeeds its own converter, and is skipped by a PDF-only policy:")
    write("E015-broken-zip.cbz", b"PK\x03\x04\x14\x00\x00\x00\x08\x00" + FILLER[:64], "Unreadable file")
    write("E016-cbz-no-images.cbz", zip_of({"readme.txt": b"no images"}), "Empty file")
    write("E018-not-a-cbz.cbz", b"plain text wearing a .cbz extension\n", "Wrong file type")
    write("E021-broken-eml.eml", b"Not: a header\r\nnor a body, and no blank line", "Unreadable file")
    write("E020-empty.eml", b"", "Empty file")
    write("E034-broken-image.png", b"\x89PNG\r\n\x1a\x08" + FILLER[:64], "Unreadable file")

    print(f"\n{len(list(OUT.iterdir()))} files in {OUT}")


if __name__ == "__main__":
    main()
