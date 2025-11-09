# Type3 Font Library Management Guide

## Overview

This guide explains how to add new fonts to the Type3 font library, including:
1. Finding Type3 fonts in PDFs
2. Extracting and analyzing Type3 fonts
3. Adding pre-converted TTF/OTF fonts to the library
4. Importing fonts with example PDFs

---

## Two Approaches to Adding Fonts

### Approach 1: Import Existing TTF/OTF Files

**When to use:** You already have a TTF/OTF file that matches a Type3 font you encounter.

**Example:** You find a PDF with a Type3 font that's actually DejaVu Sans, and you have the official DejaVu Sans TTF file.

### Approach 2: Extract from Type3 PDFs

**When to use:** The Type3 font is unique to a PDF (no standard equivalent exists).

**Example:** Custom corporate fonts, specialized scientific notation, or generated fonts.

---

## Approach 1: Import Existing TTF/OTF Files

This is the **recommended approach** when possible, as it gives you the full font with proper Unicode mappings.

### Step 1: Find the Type3 Font Signature

Use the signature tool to analyze a PDF containing the Type3 font:

```bash
./gradlew :proprietary:type3SignatureTool \
  --args="--pdf examples/matplotlib_chart.pdf --output matplotlib_fonts.json --pretty"
```

**Output (`matplotlib_fonts.json`):**
```json
{
  "fonts": [
    {
      "fontId": "F1",
      "pageNumber": 1,
      "baseName": "BMQQDV+DejaVuSans",
      "subtype": "Type3",
      "signature": "sha256:2be58b6ef1e29a83b8634d70b9e32c37a15dea2e608894439ef7224c35b77f5d",
      "glyphCount": 50,
      "glyphs": [
        {
          "charCode": 65,
          "glyphName": "A",
          "unicode": 65,
          "advanceWidth": 684,
          "bbox": [0, 0, 684, 729]
        }
      ]
    }
  ]
}
```

**Key information:**
- `signature`: Unique fingerprint of this font
- `baseName`: Font name in the PDF (often subset like "BMQQDV+DejaVuSans")
- `glyphs`: Character codes and Unicode mappings

### Step 2: Obtain the Matching TTF/OTF File

**Sources:**
1. **System fonts:** Check if the font is already installed
   - Windows: `C:\Windows\Fonts\`
   - Linux: `/usr/share/fonts/`
   - macOS: `/Library/Fonts/`

2. **Official font websites:**
   - [DejaVu Fonts](https://dejavu-fonts.github.io/)
   - [Computer Modern Unicode](https://www.fontsquirrel.com/fonts/computer-modern)
   - [STIX Fonts](https://www.stixfonts.org/)
   - [Google Fonts](https://fonts.google.com/)

3. **Font foundries:** If it's a commercial font, you'll need a license

**Example - Getting DejaVu Sans:**
```bash
# Download from official source
wget https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.tar.bz2

# Extract
tar xjf dejavu-fonts-ttf-2.37.tar.bz2

# Copy the needed font
cp dejavu-fonts-ttf-2.37/ttf/DejaVuSans.ttf app/core/src/main/resources/type3/library/fonts/dejavu/
```

### Step 3: Add Entry to Library Index

Edit `app/core/src/main/resources/type3/library/index.json`:

```json
[
  {
    "id": "dejavu-sans-regular",
    "label": "DejaVu Sans",
    "aliases": [
      "DejaVuSans",
      "BMQQDV+DejaVuSans",
      "DejaVuSansDisplay",
      "dejavusans"
    ],
    "signatures": [
      "sha256:2be58b6ef1e29a83b8634d70b9e32c37a15dea2e608894439ef7224c35b77f5d"
    ],
    "pdfProgram": {
      "resource": "type3/library/fonts/dejavu/DejaVuSans.ttf",
      "format": "ttf"
    },
    "webProgram": {
      "resource": "type3/library/fonts/dejavu/DejaVuSans.ttf",
      "format": "ttf"
    },
    "glyphCoverage": [32, 33, 65, 66, 67, 68, 69, ...],
    "source": "DejaVu Fonts 2.37"
  }
]
```

**Field descriptions:**

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `id` | ✅ | Unique identifier (lowercase, hyphenated) | `"dejavu-sans-bold"` |
| `label` | ✅ | Human-readable name | `"DejaVu Sans Bold"` |
| `aliases` | ✅ | Font name variations to match | `["DejaVuSans-Bold", "EVICAO+DejaVuSans-Bold"]` |
| `signatures` | ✅ | SHA256 hashes from signature tool | `["sha256:a1b2c3..."]` |
| `pdfProgram` | ✅ | Font file for PDF embedding | See below |
| `webProgram` | ⚠️ | Font file for browser preview (can be same as pdfProgram) | See below |
| `glyphCoverage` | ❌ | Unicode code points covered (optional) | `[65, 66, 67]` |
| `source` | ❌ | Attribution/version info (optional) | `"DejaVu Fonts 2.37"` |

**Program format:**
```json
"pdfProgram": {
  "resource": "type3/library/fonts/dejavu/DejaVuSans.ttf",
  "format": "ttf"
}
```
- `resource`: Path relative to classpath root (or absolute file:// path)
- `format`: `"ttf"` or `"otf"`

### Step 4: Add to Catalogue (Optional)

Edit `app/core/src/main/resources/type3/catalogue.json`:

```json
{
  "fonts": [
    {
      "name": "DejaVuSans",
      "source": "Matplotlib PDFs",
      "variants": ["Regular", "Bold", "Oblique"],
      "status": "complete"
    }
  ]
}
```

### Step 5: Test the Font

1. **Rebuild the application:**
   ```bash
   ./gradlew clean build
   ```

2. **Convert a PDF with the Type3 font:**
   ```bash
   curl -X POST http://localhost:8080/api/v1/convert/pdf/to-json \
     -F file=@test.pdf \
     -o output.json
   ```

3. **Check the JSON output:**
   ```bash
   # Look for conversionCandidates
   cat output.json | jq '.fonts[] | select(.baseName | contains("DejaVu"))'
   ```

4. **Expected output:**
   ```json
   {
     "id": "F1",
     "baseName": "BMQQDV+DejaVuSans",
     "subtype": "Type3",
     "conversionCandidates": [
       {
         "strategyId": "type3-library",
         "status": "SUCCESS",
         "message": "Matched DejaVu Sans via alias:dejavusans",
         "pdfProgram": "T1RUTwAJAIAAAwAQQ0ZGIHHwJ9o...",
         "pdfProgramFormat": "ttf"
       }
     ]
   }
   ```

5. **Test round-trip conversion:**
   ```bash
   # Convert back to PDF
   curl -X POST http://localhost:8080/api/v1/convert/json/to-pdf \
     -F file=@output.json \
     -o roundtrip.pdf

   # Verify text renders correctly
   pdftotext roundtrip.pdf - | head
   ```

---

## Approach 2: Extract from Type3 PDFs

When no standard TTF/OTF exists, you can convert the Type3 font itself.

⚠️ **Note:** This produces a synthetic font that may not be perfect. Use Approach 1 whenever possible.

### Step 1: Extract Type3 Metadata

Same as Approach 1 - use the signature tool:

```bash
./gradlew :proprietary:type3SignatureTool \
  --args="--pdf custom_font.pdf --output custom_font_analysis.json --pretty"
```

### Step 2: Convert Type3 to TTF Using Python Script

Use the included conversion script:

```bash
# Install fontTools if not already installed
pip install fonttools

# Convert the Type3 font
python scripts/type3_to_cff.py \
  --input custom_font_analysis.json \
  --output-cff custom_font.otf \
  --output-ttf custom_font.ttf \
  --font-name "CustomFont" \
  --family-name "Custom Font Family"
```

**Script options:**
- `--input`: JSON file from signature tool
- `--output-cff`: OpenType-CFF output (best for PDF)
- `--output-ttf`: TrueType output (best for web)
- `--font-name`: PostScript name (no spaces)
- `--family-name`: Human-readable name

### Step 3: Copy Font to Library

```bash
# Create directory for custom fonts
mkdir -p app/core/src/main/resources/type3/library/fonts/custom/

# Copy the converted fonts
cp custom_font.otf app/core/src/main/resources/type3/library/fonts/custom/
cp custom_font.ttf app/core/src/main/resources/type3/library/fonts/custom/
```

### Step 4: Add to Library Index

Same as Approach 1, but note the synthetic nature:

```json
{
  "id": "custom-font-regular",
  "label": "Custom Font",
  "aliases": ["CustomFont", "ABCDEF+CustomFont"],
  "signatures": ["sha256:extracted-from-json"],
  "pdfProgram": {
    "resource": "type3/library/fonts/custom/custom_font.otf",
    "format": "otf"
  },
  "webProgram": {
    "resource": "type3/library/fonts/custom/custom_font.ttf",
    "format": "ttf"
  },
  "source": "Converted from custom_font.pdf",
  "glyphCoverage": [65, 66, 67, 68, 69]
}
```

### Step 5: Quality Check

Type3 → TTF conversion may have issues:

1. **Check glyph rendering:**
   - Open the TTF in a font viewer (FontForge, FontDrop)
   - Verify all glyphs look correct

2. **Check metrics:**
   - Compare advance widths to original
   - Verify bounding boxes

3. **Test in PDF:**
   - Create a test document using the font
   - Verify it renders the same as the original PDF

---

## Adding Fonts with Example PDFs

### Scenario: You Want to Support Matplotlib PDFs

Matplotlib uses DejaVu Sans fonts but embeds them as Type3 fonts with subset names.

### Step 1: Collect Example PDFs

```bash
# Create a samples directory
mkdir -p samples/matplotlib/

# Download or copy example PDFs
cp ~/Downloads/matplotlib_chart.pdf samples/matplotlib/01_chart.pdf
cp ~/Downloads/matplotlib_plot.pdf samples/matplotlib/02_plot.pdf
```

### Step 2: Batch Analyze Fonts

```bash
# Analyze all samples
for pdf in samples/matplotlib/*.pdf; do
  basename=$(basename "$pdf" .pdf)
  ./gradlew :proprietary:type3SignatureTool \
    --args="--pdf $pdf --output analysis_${basename}.json --pretty"
done
```

### Step 3: Identify Common Fonts

Use the summarize script to see what fonts appear:

```bash
python scripts/summarize_type3_signatures.py \
  --signatures-dir . \
  --output summary.md
```

**Output (`summary.md`):**
```markdown
# Type3 Font Signature Inventory

## Fonts by Signature

### sha256:2be58b6ef1e...
- **Alias:** DejaVuSans, BMQQDV+DejaVuSans
- **Seen in:** 01_chart.pdf, 02_plot.pdf
- **Status:** ✅ In library (dejavu-sans-regular)

### sha256:a1b2c3d4e5f6...
- **Alias:** DejaVuSans-Bold, EVICAO+DejaVuSans-Bold
- **Seen in:** 01_chart.pdf
- **Status:** ❌ Missing from library
```

### Step 4: Add Missing Fonts

For each missing font:

1. **Download the standard version:**
   ```bash
   # DejaVu Sans Bold
   wget https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.tar.bz2
   tar xjf dejavu-fonts-ttf-2.37.tar.bz2
   cp dejavu-fonts-ttf-2.37/ttf/DejaVuSans-Bold.ttf \
      app/core/src/main/resources/type3/library/fonts/dejavu/
   ```

2. **Add to index.json:**
   ```json
   {
     "id": "dejavu-sans-bold",
     "label": "DejaVu Sans Bold",
     "aliases": [
       "DejaVuSans-Bold",
       "EVICAO+DejaVuSans-Bold",
       "dejavusans-bold"
     ],
     "signatures": [
       "sha256:a1b2c3d4e5f6..."
     ],
     "pdfProgram": {
       "resource": "type3/library/fonts/dejavu/DejaVuSans-Bold.ttf",
       "format": "ttf"
     },
     "webProgram": {
       "resource": "type3/library/fonts/dejavu/DejaVuSans-Bold.ttf",
       "format": "ttf"
     },
     "source": "DejaVu Fonts 2.37"
   }
   ```

### Step 5: Update Library Automatically

Use the update script to sync signatures:

```bash
python scripts/update_type3_library.py \
  --signatures-dir . \
  --apply
```

This script:
- Reads all `analysis_*.json` files
- Matches them to library entries by alias
- Updates signatures and glyph coverage
- Writes back to `index.json`

### Step 6: Verify Coverage

Test with all your example PDFs:

```bash
for pdf in samples/matplotlib/*.pdf; do
  echo "Testing $pdf..."
  curl -X POST http://localhost:8080/api/v1/convert/pdf/to-json \
    -F file=@"$pdf" \
    -o test_output.json

  # Check for successful matches
  matches=$(cat test_output.json | jq '[.fonts[].conversionCandidates[] | select(.status == "SUCCESS")] | length')
  total=$(cat test_output.json | jq '.fonts | length')
  echo "  Matched $matches of $total fonts"
done
```

---

## Common Fonts to Add

### Matplotlib (Python plotting library)

**Fonts used:** DejaVu Sans family

```bash
# Download DejaVu fonts
wget https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.tar.bz2
tar xjf dejavu-fonts-ttf-2.37.tar.bz2

# Copy needed variants
cp dejavu-fonts-ttf-2.37/ttf/DejaVuSans.ttf \
   app/core/src/main/resources/type3/library/fonts/dejavu/
cp dejavu-fonts-ttf-2.37/ttf/DejaVuSans-Bold.ttf \
   app/core/src/main/resources/type3/library/fonts/dejavu/
cp dejavu-fonts-ttf-2.37/ttf/DejaVuSans-Oblique.ttf \
   app/core/src/main/resources/type3/library/fonts/dejavu/
cp dejavu-fonts-ttf-2.37/ttf/DejaVuSansMono.ttf \
   app/core/src/main/resources/type3/library/fonts/dejavu/
```

### LaTeX Documents

**Fonts used:** Computer Modern family

```bash
# Download Computer Modern Unicode
wget https://downloads.sourceforge.net/project/cm-unicode/cm-unicode/0.7.0/cm-unicode-0.7.0-ttf.tar.xz
tar xJf cm-unicode-0.7.0-ttf.tar.xz

# Copy common variants
cp cm-unicode-0.7.0/cmunrm.ttf \
   app/core/src/main/resources/type3/library/fonts/cm/cmr10.ttf
cp cm-unicode-0.7.0/cmunti.ttf \
   app/core/src/main/resources/type3/library/fonts/cm/cmmi10.ttf
cp cm-unicode-0.7.0/cmunsy.ttf \
   app/core/src/main/resources/type3/library/fonts/cm/cmsy10.ttf
```

### Scientific Documents

**Fonts used:** STIX fonts

```bash
# Download STIX
wget https://github.com/stipub/stixfonts/raw/master/fonts/static_otf/STIXTwoText-Regular.otf

# Copy to library
cp STIXTwoText-Regular.otf \
   app/core/src/main/resources/type3/library/fonts/stix/
```

---

## Troubleshooting

### Signature Doesn't Match

**Problem:** You added a font but PDFs still don't match.

**Causes:**
1. **Different font version:** The Type3 font in the PDF uses a different version
2. **Subset differences:** Subset fonts may have different signatures
3. **Alias mismatch:** Font name in PDF doesn't match any alias

**Solutions:**

1. **Check the PDF's font name:**
   ```bash
   pdffonts sample.pdf
   ```
   Output shows: `BMQQDV+DejaVuSans`

2. **Add the subset name as an alias:**
   ```json
   "aliases": [
     "DejaVuSans",
     "BMQQDV+DejaVuSans",  // Add this
     "dejavusans"
   ]
   ```

3. **Add multiple signatures:**
   ```json
   "signatures": [
     "sha256:original-signature",
     "sha256:subset-signature"  // Add from your PDF
   ]
   ```

### Font Renders Incorrectly

**Problem:** Text appears but glyphs look wrong.

**Causes:**
1. **Wrong font file:** You matched a different font
2. **Glyph coverage mismatch:** Font doesn't have all the glyphs
3. **Encoding issues:** Character codes don't match

**Solutions:**

1. **Verify it's the right font:**
   - Open both the Type3 PDF and your TTF in a font viewer
   - Compare glyph shapes visually

2. **Check glyph coverage:**
   ```bash
   # Extract glyphs from Type3
   ./gradlew :proprietary:type3SignatureTool \
     --args="--pdf sample.pdf --output analysis.json"

   # Compare to font file
   ttfdump -t cmap your_font.ttf | grep "glyphID"
   ```

3. **Use a more complete font version:**
   - Get the full font (not a subset)
   - Ensure all Unicode ranges are covered

### Missing Glyphs

**Problem:** Some characters don't render.

**Cause:** The TTF/OTF file doesn't have all the glyphs that the Type3 font had.

**Solution:** You need a more complete font, or must use Approach 2 to convert the Type3 font itself.

---

## Library Maintenance Scripts

### `type3SignatureTool`

**Purpose:** Analyze Type3 fonts in a PDF

```bash
./gradlew :proprietary:type3SignatureTool \
  --args="--pdf INPUT.pdf --output OUTPUT.json [--pretty]"
```

### `summarize_type3_signatures.py`

**Purpose:** Create an inventory of fonts across multiple PDFs

```bash
python scripts/summarize_type3_signatures.py \
  --signatures-dir path/to/jsons/ \
  --output inventory.md
```

### `update_type3_library.py`

**Purpose:** Sync signature JSON files with library index

```bash
# Dry run (show what would change)
python scripts/update_type3_library.py \
  --signatures-dir analysis/

# Apply changes
python scripts/update_type3_library.py \
  --signatures-dir analysis/ \
  --apply
```

### `type3_to_cff.py`

**Purpose:** Convert Type3 glyph JSON to TTF/OTF

```bash
python scripts/type3_to_cff.py \
  --input type3_data.json \
  --output-cff font.otf \
  --output-ttf font.ttf \
  --font-name MyFont \
  --family-name "My Font Family"
```

---

## Best Practices

1. **Always prefer official fonts** (Approach 1) over synthesized ones (Approach 2)
2. **Use multiple signatures** for fonts that appear in different PDFs with different subset names
3. **Test with real PDFs** before considering a font "done"
4. **Document the source** in the `source` field for attribution and versioning
5. **Keep example PDFs** for each font in case you need to debug later
6. **Version the library** - commit `index.json` changes with clear descriptions

---

## File Size Considerations

### Font File Sizes

Typical sizes:
- **DejaVu Sans:** ~750KB per variant
- **Computer Modern:** ~200-400KB per variant
- **STIX Math:** ~500KB-1MB per variant

### Library Size Management

Current library: **~3MB** (10 fonts)

To keep the library manageable:
1. **Only include common fonts** (used in >5% of PDFs you process)
2. **Don't include every variant** (e.g., skip "Ultra Light" if rarely used)
3. **Consider subsetting** for languages you don't support
4. **Use OTF/CFF over TTF** when possible (better compression for PDF)

---

## Related Documentation

- [PDF JSON Type3 Font System](pdf_json_type3_fonts.md) - Technical architecture
- [PDF Text Edit Flow](pdf_text_edit_flow.md) - Overall editing workflow
- [Type3 Fallback Plan](type3_fallback_plan.md) - Original design document
