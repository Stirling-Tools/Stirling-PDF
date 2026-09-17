#!/usr/bin/env python3
"""Generate input files that fail a policy run, and only those.

Two rules decide what can be here at all, both learned the hard way:

PDFBox 3 repairs structural damage, so a PDF truncated mid-object has a valid header, gets its
xref rebuilt, and processes normally. Only bytes it cannot find a header in fail.

Every PDF that fails to load is reported as damaged, because the corruption check matches on
message text and its patterns cover almost anything PDFBox gives up on. So a PDF-only policy can
produce exactly two kinds: damaged, and empty. Files promising anything else belong under
needs-specific-step/, where it is clear they will do nothing in a redact or compress policy.
"""

import pathlib

OUT = pathlib.Path(__file__).parent / "files"
SPECIFIC = OUT / "needs-specific-step"

# Deterministic filler, so regenerating does not churn the files: a fixture that differs run to
# run cannot be compared against a previous failure.
FILLER = bytes((i * 7 + 13) % 256 for i in range(2048))

# Valid, loadable, and holds no pages. PDFBox reads it without complaint, which is the point: the
# failure has to come from a step that asks for pages, and redact is not one.
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


def write(directory: pathlib.Path, name: str, data: bytes, expected: str) -> None:
    (directory / name).write_bytes(data)
    print(f"  {name:<34} {len(data):>6}B  {expected}")


def main() -> None:
    SPECIFIC.mkdir(parents=True, exist_ok=True)
    for stale in OUT.rglob("*"):
        if stale.is_file():
            stale.unlink()

    print("Fails in any PDF policy (redact, compress, rotate):")
    # No %PDF header anywhere, so there is nothing to rebuild from. The one corruption shape
    # confirmed to fail rather than be repaired.
    write(OUT, "E001-damaged-no-header.pdf", b"Not a PDF.\n" + FILLER, "Damaged document")
    write(OUT, "E001-damaged-garbage-body.pdf", b"%PDF-1.7\n" + FILLER, "Damaged document")
    write(OUT, "E032-empty.pdf", b"", "Empty file")

    print("\nneeds-specific-step/ — does nothing in a redact or compress policy:")
    write(SPECIFIC, "E005-zero-pages.pdf", ZERO_PAGE_PDF, "Empty file, via extract content or PDF to CBZ")

    print(f"\n{len(list(OUT.glob('*.pdf')))} in files/, {len(list(SPECIFIC.iterdir()))} in needs-specific-step/")


if __name__ == "__main__":
    main()
