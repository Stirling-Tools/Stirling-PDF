# PDF Text Edit Flow

This high-level diagram shows every major component involved when a user edits text inside a PDF via the JSON editor. It highlights where fonts (especially Type3) are captured, matched against the library, and re-applied during export.

```mermaid
flowchart TD
    %% Upload & Extraction
    A([Upload PDF]) --> B[PdfJsonConversionService]
    B --> B1[Optional Ghostscript preflight]
    B1 --> B2[Iterate pages & resources]
    B2 --> B3[Extract text runs + fonts]

    %% Font handling (serial tree)
    B3 --> C{Font subtype?}
    C -->|Type 0 / TrueType / CID| C1[Copy embedded program bytes]
    C -->|Type3| C2[Type3FontConversionService]
    C1 --> C4[Attach font payload + metadata]
    C2 --> C21{Library match?}
    C21 --|Yes|--> C22[Inject canonical TTF/OTF from library]
    C21 --|No|--> C23[Mark unsupported<br/>& keep Type3 glyphs]
    C2 --> C25[Record glyph charCodes + unicode mapping]
    C22 --> C25
    C23 --> C25

    %% JSON output
    C4 --> D[Build PdfJsonDocument (pages, fonts, elements)]
    C25 --> D
    D --> E([Send JSON to UI])

    %% Edit round-trip
    E --> F[User edits text/elements]
    F --> G[Patched JSON POSTed back]
    G --> H{Regeneration pipeline}
    H --> H1[Resolve fonts + candidates]
    H1 --> H11[Prefer library/embedded payloads]
    H1 --> H12[Fallback font service for missing glyphs]
    H --> H2{Can rewrite token stream?}
    H2 -->|Yes| H21[Rewrite existing operators]
    H2 -->|No| H22[Full page regeneration]
    H22 --> H23[Embed canonical fonts + Type3 glyph codes]
    H21 --> I[Apply annotations/metadata]
    H23 --> I
    I --> J([Download edited PDF])
```

**Key points**
- Type3 conversion happens entirely inside `Type3FontConversionService`. Matching entries pull canonical fonts from the library; when a signature is missing we simply keep the original Type3 glyph codes until a library entry is added.
- Raw Type3 char codes are preserved in `PdfJsonTextElement.charCodes` so edits can fall back to the original glyph sequence when users do not change the text.
- When the frontend submits changes, the backend preflights each text run, picks the proper font candidate (library > embedded > fallback), and rewrites the PDF with either token replacements or full page regeneration.
- Glyph coverage metadata from the Type3 library now informs which fonts can legitimately render new characters, so added text keeps using the original Type3 face whenever its coverage includes those code points.
