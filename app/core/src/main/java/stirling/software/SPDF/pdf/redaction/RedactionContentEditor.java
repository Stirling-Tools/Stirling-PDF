package stirling.software.SPDF.pdf.redaction;

import java.awt.Color;
import java.awt.geom.Rectangle2D;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSFloat;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdfwriter.ContentStreamWriter;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.text.PDFTextStripperByArea;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.pdf.parser.PageImageLocator;

/**
 * Content-stream editing: physically removes glyphs from page and form-XObject streams, both by
 * literal/regex match (auto-word) and by rect intersection (manual area), plus the area-capture and
 * overlay/annotation helpers those paths rely on.
 */
@Slf4j
final class RedactionContentEditor {

    private static final int MAX_XOBJECT_DEPTH = 10;

    private RedactionContentEditor() {}

    /** True only for upright pages whose CropBox origin is (0,0), where the rect flip is exact. */
    static boolean isSurgicallySafe(PDPage page) {
        if (page.getRotation() != 0) {
            return false;
        }
        PDRectangle crop = page.getCropBox();
        return crop.getLowerLeftX() == 0f && crop.getLowerLeftY() == 0f;
    }

    /** Drop annotations whose rectangle overlaps any redaction rect. */
    static void removeOverlappingAnnotations(PDPage page, List<PDRectangle> rects) {
        try {
            List<PDAnnotation> kept = new ArrayList<>();
            for (var ann : page.getAnnotations()) {
                PDRectangle ar = ann.getRectangle();
                boolean overlaps = false;
                if (ar != null) {
                    Rectangle2D.Float a =
                            new Rectangle2D.Float(
                                    ar.getLowerLeftX(),
                                    ar.getLowerLeftY(),
                                    ar.getWidth(),
                                    ar.getHeight());
                    for (PDRectangle rect : rects) {
                        if (a.intersects(
                                rect.getLowerLeftX(),
                                rect.getLowerLeftY(),
                                rect.getWidth(),
                                rect.getHeight())) {
                            overlaps = true;
                            break;
                        }
                    }
                }
                if (!overlaps) {
                    kept.add(ann);
                }
            }
            page.setAnnotations(kept);
        } catch (Exception e) {
            log.debug("Could not strip overlapping annotations: {}", e.getMessage());
        }
    }

    static List<Pattern> effectivePatterns(Set<String> literalTargets, List<Pattern> patterns) {
        List<Pattern> result = new ArrayList<>();
        if (literalTargets != null) {
            for (String target : literalTargets) {
                if (target == null || target.isEmpty()) {
                    continue;
                }
                // Case-insensitive to match TextFinderUtils; removal must not miss finder hits.
                result.add(
                        Pattern.compile(
                                Pattern.quote(target),
                                Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE));
            }
        }
        if (patterns != null) {
            result.addAll(patterns);
        }
        return result;
    }

    // Per-page content-stream rewrite (literal/regex based)

    static void rewritePageContent(PDDocument document, PDPage page, List<Pattern> patterns)
            throws IOException {
        PDResources resources = page.getResources();
        if (resources == null) {
            return;
        }
        List<Object> tokens = parseTokens(new PDFStreamParser(page));
        boolean modified = rewriteTokens(tokens, resources, patterns);
        if (modified) {
            writePageTokens(document, page, tokens);
        }
        // Recurse into form XObjects referenced by this page (shared visited set + depth cap).
        rewriteFormXObjects(resources, resources, patterns, new HashSet<>(), 0);
    }

    private static void rewriteFormXObjects(
            PDResources resources,
            PDResources parentResources,
            List<Pattern> patterns,
            Set<COSBase> visited,
            int depth)
            throws IOException {
        if (depth > MAX_XOBJECT_DEPTH) {
            log.warn("XObject nesting exceeded {}; stopping recursion", MAX_XOBJECT_DEPTH);
            return;
        }
        for (COSName name : resources.getXObjectNames()) {
            try {
                var xobj = resources.getXObject(name);
                if (!(xobj instanceof PDFormXObject form)) {
                    continue;
                }
                if (!visited.add(form.getCOSObject())) {
                    continue;
                }
                List<Object> tokens = parseTokens(new PDFStreamParser(form));
                // Forms may inherit fonts from the parent when they carry no own /Resources.
                PDResources formResources =
                        form.getResources() != null ? form.getResources() : parentResources;
                boolean modified = rewriteTokens(tokens, formResources, patterns);
                if (modified) {
                    // A form XObject's content IS its own stream body; overwrite it in place.
                    PDStream formStream = new PDStream(form.getCOSObject());
                    try (var out = formStream.createOutputStream(COSName.FLATE_DECODE)) {
                        new ContentStreamWriter(out).writeTokens(tokens);
                    }
                }
                rewriteFormXObjects(formResources, formResources, patterns, visited, depth + 1);
            } catch (IOException e) {
                log.debug("Failed to rewrite XObject {}: {}", name.getName(), e.getMessage());
            }
        }
    }

    private static List<Object> parseTokens(PDFStreamParser parser) throws IOException {
        List<Object> tokens = new ArrayList<>();
        Object t;
        while ((t = parser.parseNextToken()) != null) {
            tokens.add(t);
        }
        return tokens;
    }

    /** Walk tokens keeping a tiny text state (current font). */
    private static boolean rewriteTokens(
            List<Object> tokens, PDResources resources, List<Pattern> patterns) {
        boolean modified = false;
        PDFont currentFont = null;
        for (int i = 0; i < tokens.size(); i++) {
            Object tok = tokens.get(i);
            if (!(tok instanceof Operator op)) {
                continue;
            }
            String name = op.getName();
            if ("Tf".equals(name) && i >= 2) {
                Object fontNameTok = tokens.get(i - 2);
                if (fontNameTok instanceof COSName fontName) {
                    try {
                        currentFont = resources.getFont(fontName);
                    } catch (IOException ex) {
                        log.debug(
                                "Could not resolve font {}: {}",
                                fontName.getName(),
                                ex.getMessage());
                        currentFont = null;
                    }
                }
            } else if (RedactionPipeline.TEXT_SHOWING_OPERATORS.contains(name) && i >= 1) {
                int operandIdx = i - 1;
                Object operand = tokens.get(operandIdx);
                if (operand instanceof COSString cosString) {
                    COSString replacement = rewriteCosString(cosString, currentFont, patterns);
                    if (replacement != null) {
                        tokens.set(operandIdx, replacement);
                        modified = true;
                    }
                } else if (operand instanceof COSArray arr) {
                    COSArray newArr = rewriteCosArray(arr, currentFont, patterns);
                    if (newArr != null) {
                        tokens.set(operandIdx, newArr);
                        modified = true;
                    }
                }
            }
        }
        return modified;
    }

    private static COSString rewriteCosString(
            COSString cosString, PDFont font, List<Pattern> patterns) {
        if (font == null) {
            // Without a font we cannot decode safely.
            return rewriteRawLatin(cosString, patterns);
        }
        DecodeResult decoded = decodeCosString(cosString, font);
        if (decoded == null) {
            return rewriteRawLatin(cosString, patterns);
        }
        boolean[] drop = findDroppedCharsMask(decoded.text, patterns);
        if (drop == null) {
            return null;
        }
        return buildFilteredCosString(decoded, drop, font);
    }

    private static COSArray rewriteCosArray(COSArray arr, PDFont font, List<Pattern> patterns) {
        // Build a concatenated decode across all COSString elements so that matches
        List<DecodeResult> parts = new ArrayList<>();
        StringBuilder concat = new StringBuilder();
        for (int i = 0; i < arr.size(); i++) {
            COSBase elem = arr.get(i);
            if (elem instanceof COSString cs) {
                DecodeResult decoded = font != null ? decodeCosString(cs, font) : null;
                if (decoded == null) {
                    decoded = decodeAsLatin(cs);
                }
                parts.add(decoded);
                concat.append(decoded.text);
            } else {
                parts.add(null);
            }
        }
        boolean[] fullDrop = findDroppedCharsMask(concat.toString(), patterns);
        if (fullDrop == null) {
            return null;
        }
        COSArray out = new COSArray();
        int cursor = 0;
        for (int i = 0; i < arr.size(); i++) {
            COSBase elem = arr.get(i);
            if (elem instanceof COSString cs) {
                DecodeResult decoded = parts.get(i);
                int partLen = decoded.text.length();
                boolean[] partDrop = new boolean[partLen];
                System.arraycopy(fullDrop, cursor, partDrop, 0, partLen);
                cursor += partLen;
                COSString rebuilt =
                        buildFilteredCosStringRaw(decoded, partDrop, font, cs.getBytes());
                // A zero-length COSString is valid; PDFBox emits it as () producing no
                out.add(rebuilt);
            } else {
                out.add(elem);
            }
        }
        return out;
    }

    /** For cases where we have no font - treat the bytes as latin-1 characters. */
    private static COSString rewriteRawLatin(COSString cosString, List<Pattern> patterns) {
        DecodeResult decoded = decodeAsLatin(cosString);
        boolean[] drop = findDroppedCharsMask(decoded.text, patterns);
        if (drop == null) {
            return null;
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (int i = 0; i < decoded.text.length(); i++) {
            if (drop[i]) continue;
            out.write(decoded.text.charAt(i) & 0xFF);
        }
        return new COSString(out.toByteArray());
    }

    private static DecodeResult decodeAsLatin(COSString cosString) {
        byte[] bytes = cosString.getBytes();
        StringBuilder sb = new StringBuilder(bytes.length);
        int[] codeStart = new int[bytes.length];
        int[] codeLen = new int[bytes.length];
        for (int i = 0; i < bytes.length; i++) {
            sb.append((char) (bytes[i] & 0xFF));
            codeStart[i] = i;
            codeLen[i] = 1;
        }
        return new DecodeResult(sb.toString(), bytes, codeStart, codeLen);
    }

    /** Decode a COSString to Unicode via the font; null if decoding fails. */
    private static DecodeResult decodeCosString(COSString cosString, PDFont font) {
        byte[] bytes = cosString.getBytes();
        StringBuilder text = new StringBuilder();
        List<Integer> starts = new ArrayList<>();
        List<Integer> lens = new ArrayList<>();
        try (ByteArrayInputStream in = new ByteArrayInputStream(bytes)) {
            int pos = 0;
            while (in.available() > 0) {
                int before = in.available();
                int code;
                try {
                    code = font.readCode(in);
                } catch (IOException | RuntimeException ex) {
                    log.debug(
                            "Font {} failed to decode byte sequence: {}",
                            font.getName(),
                            ex.getMessage());
                    return null;
                }
                int consumed = before - in.available();
                String unicode;
                try {
                    unicode = font.toUnicode(code);
                } catch (Exception ex) {
                    unicode = null;
                }
                if (unicode == null) {
                    // If the font has no ToUnicode mapping we cannot match reliably - return
                    return null;
                }
                text.append(unicode);
                // Associate every Unicode character produced with the same code byte range
                for (int c = 0; c < unicode.length(); c++) {
                    starts.add(pos);
                    lens.add(consumed);
                }
                if (consumed == 0) {
                    // Defensive: avoid infinite loop on malformed fonts.
                    break;
                }
                pos += consumed;
            }
        } catch (IOException e) {
            return null;
        }
        int[] startArr = starts.stream().mapToInt(Integer::intValue).toArray();
        int[] lenArr = lens.stream().mapToInt(Integer::intValue).toArray();
        return new DecodeResult(text.toString(), bytes, startArr, lenArr);
    }

    /** Null if no pattern matches; else a per-char drop mask over the text. */
    private static boolean[] findDroppedCharsMask(String text, List<Pattern> patterns) {
        boolean any = false;
        boolean[] mask = new boolean[text.length()];
        for (Pattern pattern : patterns) {
            Matcher m;
            try {
                m = pattern.matcher(DeadlineCharSequence.of(text));
            } catch (Exception ex) {
                continue;
            }
            while (m.find()) {
                int s = m.start();
                int e = m.end();
                if (e <= s) continue;
                for (int i = s; i < e; i++) {
                    mask[i] = true;
                }
                any = true;
            }
        }
        return any ? mask : null;
    }

    private static COSString buildFilteredCosString(
            DecodeResult decoded, boolean[] drop, PDFont font) {
        return buildFilteredCosStringRaw(decoded, drop, font, decoded.bytes);
    }

    private static COSString buildFilteredCosStringRaw(
            DecodeResult decoded, boolean[] drop, PDFont font, byte[] originalBytes) {
        // Collect code byte-ranges to drop.
        Set<Integer> dropStarts = new HashSet<>();
        for (int i = 0; i < drop.length; i++) {
            if (drop[i]) {
                dropStarts.add(decoded.codeStarts[i]);
            }
        }
        // Map byte-start -> code length once (O(n)); findCodeLenAt was an O(n^2) linear scan.
        Map<Integer, Integer> lenByStart = new HashMap<>();
        for (int j = 0; j < decoded.codeStarts.length; j++) {
            lenByStart.putIfAbsent(decoded.codeStarts[j], decoded.codeLens[j]);
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int i = 0;
        while (i < originalBytes.length) {
            int start = i;
            int len = lenByStart.getOrDefault(start, -1);
            if (len <= 0) {
                // Unknown - keep the byte verbatim.
                out.write(originalBytes[i] & 0xFF);
                i += 1;
                continue;
            }
            if (dropStarts.contains(start)) {
                // Replace dropped code with encoded space if possible.
                byte[] spaceBytes = tryEncodeSpace(font);
                if (spaceBytes != null) {
                    out.write(spaceBytes, 0, spaceBytes.length);
                }
            } else {
                out.write(originalBytes, start, len);
            }
            i += len;
        }
        return new COSString(out.toByteArray());
    }

    private static byte[] tryEncodeSpace(PDFont font) {
        if (font == null) {
            return new byte[] {0x20};
        }
        try {
            return font.encode(" ");
        } catch (Exception e) {
            // Some fonts cannot encode a space at all (e.g. Type3 throws
            return null;
        }
    }

    private static final class DecodeResult {
        final String text;
        final byte[] bytes;
        final int[] codeStarts;
        final int[] codeLens;

        DecodeResult(String text, byte[] bytes, int[] codeStarts, int[] codeLens) {
            this.text = text;
            this.bytes = bytes;
            this.codeStarts = codeStarts;
            this.codeLens = codeLens;
        }
    }

    // Area capture

    static List<String> captureTextInRects(PDPage page, List<PDRectangle> rects)
            throws IOException {
        PDFTextStripperByArea stripper = new PDFTextStripperByArea();
        stripper.setSortByPosition(true);
        for (int i = 0; i < rects.size(); i++) {
            PDRectangle rect = rects.get(i);
            // PDFTextStripperByArea uses a Java2D rectangle in the same coordinate
            float pdfY = page.getBBox().getHeight() - rect.getUpperRightY();
            Rectangle2D.Float region =
                    new Rectangle2D.Float(
                            rect.getLowerLeftX(), pdfY, rect.getWidth(), rect.getHeight());
            stripper.addRegion("r" + i, region);
        }
        try {
            stripper.extractRegions(page);
        } catch (Exception e) {
            log.debug("Failed to extract text in rects: {}", e.getMessage());
            return Collections.emptyList();
        }
        Set<String> captured = new LinkedHashSet<>();
        for (int i = 0; i < rects.size(); i++) {
            String text = stripper.getTextForRegion("r" + i);
            if (text == null) {
                continue;
            }
            for (String token : text.split("\\s+")) {
                String trimmed = token.trim();
                if (!trimmed.isEmpty()) {
                    captured.add(trimmed);
                }
            }
        }
        return new ArrayList<>(captured);
    }

    // Content-stream rewriting (rect-driven glyph removal)

    /**
     * Blanks show-text operands whose glyphs fall in a rect. Returns false (surgical removal is
     * unreliable, caller must rasterise) when text-bearing form XObjects skew the operator ordinals
     * or an image sits under a rect - leaving the page stream untouched so the raster is correct.
     */
    static boolean removeTokensIntersectingRects(
            PDDocument document, PDPage page, List<PDRectangle> rects) throws IOException {

        List<Rectangle2D.Float> areaRects = new ArrayList<>();
        for (PDRectangle rect : rects) {
            float pdfY = page.getBBox().getHeight() - rect.getUpperRightY();
            areaRects.add(
                    new Rectangle2D.Float(
                            rect.getLowerLeftX(), pdfY, rect.getWidth(), rect.getHeight()));
        }

        int pageIndex = document.getPages().indexOf(page);
        TokenIndexCollector collector = new TokenIndexCollector(areaRects);
        collector.setStartPage(pageIndex + 1);
        collector.setEndPage(pageIndex + 1);
        collector.getText(document);
        int collectorTextOps = collector.totalTextOps();

        List<Object> tokens = parseTokens(new PDFStreamParser(page));
        int pageTextOps = 0;
        for (Object t : tokens) {
            if (t instanceof Operator op
                    && RedactionPipeline.TEXT_SHOWING_OPERATORS.contains(op.getName())) {
                pageTextOps++;
            }
        }
        // Collector ordinals span form XObjects; images under a rect can't be surgically removed.
        if (collectorTextOps != pageTextOps || imageIntersectsAnyRect(page, pageIndex, rects)) {
            return false;
        }

        // Drop ONLY the in-rect glyphs of each operand (not the whole run), tracking the active
        // font so codes decode. Bail to rasterise if the font can't decode or glyph!=code counts.
        PDResources resources = page.getResources();
        PDFont currentFont = null;
        int opCounter = -1;
        boolean modified = false;
        for (int i = 0; i < tokens.size(); i++) {
            Object tok = tokens.get(i);
            if (!(tok instanceof Operator op)) {
                continue;
            }
            String name = op.getName();
            if ("Tf".equals(name) && i >= 2 && tokens.get(i - 2) instanceof COSName fn) {
                try {
                    currentFont = resources != null ? resources.getFont(fn) : null;
                } catch (IOException e) {
                    currentFont = null;
                }
            } else if (RedactionPipeline.TEXT_SHOWING_OPERATORS.contains(name)) {
                opCounter++;
                Set<Integer> dropGlyphs = collector.dropGlyphsByOp.get(opCounter);
                if (dropGlyphs == null || dropGlyphs.isEmpty() || i < 1) {
                    continue;
                }
                // ' and " also move to the next line; converting them to TJ would lose that -
                // raster.
                if ("'".equals(name) || "\"".equals(name)) {
                    return false;
                }
                int expected = collector.glyphCountByOp.getOrDefault(opCounter, -1);
                COSArray rebuilt =
                        rebuildAdvancePreserving(
                                tokens.get(i - 1), currentFont, dropGlyphs, expected);
                if (rebuilt == null) {
                    return false; // undecodable / glyph-count mismatch - rasterise instead
                }
                // Emit as TJ so the removed glyphs' advance is preserved (no reflow).
                tokens.set(i - 1, rebuilt);
                tokens.set(i, Operator.getOperator("TJ"));
                modified = true;
            }
        }

        if (modified) {
            writePageTokens(document, page, tokens);
        }
        return true;
    }

    /** Distinct code byte-starts in order (one per glyph/code) from a per-char DecodeResult. */
    private static int[] distinctCodeStarts(DecodeResult d) {
        List<Integer> starts = new ArrayList<>();
        int last = -1;
        for (int s : d.codeStarts) {
            if (s != last) {
                starts.add(s);
                last = s;
            }
        }
        return starts.stream().mapToInt(Integer::intValue).toArray();
    }

    private static int codeAt(PDFont font, byte[] bytes, int start, int len) throws IOException {
        try (ByteArrayInputStream in = new ByteArrayInputStream(bytes, start, len)) {
            return font.readCode(in);
        }
    }

    /**
     * Rebuild a Tj/TJ operand as a TJ array that keeps every glyph EXCEPT the given 0-based
     * indexes, replacing each dropped run with a numeric adjustment equal to its advance so the
     * surviving text does not reflow into (or out of) the box. Returns null (caller rasterises) if
     * anything can't be decoded or the glyph count doesn't line up with the position pass.
     */
    private static COSArray rebuildAdvancePreserving(
            Object operand, PDFont font, Set<Integer> dropGlyphs, int expectedGlyphs) {
        if (font == null) {
            return null;
        }
        List<COSBase> elements = new ArrayList<>();
        if (operand instanceof COSString cs) {
            elements.add(cs);
        } else if (operand instanceof COSArray arr) {
            for (COSBase b : arr) {
                elements.add(b);
            }
        } else {
            return null;
        }

        COSArray out = new COSArray();
        ByteArrayOutputStream seg = new ByteArrayOutputStream();
        float pendingAdvance = 0f; // accumulated width of dropped codes, in 1/1000 text units
        int globalCode = 0;
        for (COSBase el : elements) {
            if (!(el instanceof COSString s)) {
                // Existing numeric adjustment: flush whichever run is pending, then preserve it.
                if (seg.size() > 0) {
                    out.add(new COSString(seg.toByteArray()));
                    seg.reset();
                } else if (pendingAdvance != 0f) {
                    out.add(new COSFloat(-pendingAdvance));
                    pendingAdvance = 0f;
                }
                out.add(el);
                continue;
            }
            DecodeResult d = decodeCosString(s, font);
            if (d == null) {
                return null;
            }
            byte[] b = s.getBytes();
            int[] starts = distinctCodeStarts(d);
            Map<Integer, Integer> lenByStart = new HashMap<>();
            for (int j = 0; j < d.codeStarts.length; j++) {
                lenByStart.putIfAbsent(d.codeStarts[j], d.codeLens[j]);
            }
            for (int k = 0; k < starts.length; k++) {
                int bs = starts[k];
                int len = lenByStart.getOrDefault(bs, -1);
                if (len <= 0) {
                    return null;
                }
                if (dropGlyphs.contains(globalCode)) {
                    if (seg.size() > 0) { // close the kept run before accumulating advance
                        out.add(new COSString(seg.toByteArray()));
                        seg.reset();
                    }
                    try {
                        pendingAdvance += font.getWidth(codeAt(font, b, bs, len));
                    } catch (Exception e) {
                        return null;
                    }
                } else {
                    if (pendingAdvance != 0f) { // emit the removed run's advance, then keep glyphs
                        out.add(new COSFloat(-pendingAdvance));
                        pendingAdvance = 0f;
                    }
                    seg.write(b, bs, len);
                }
                globalCode++;
            }
        }
        if (pendingAdvance != 0f) {
            out.add(new COSFloat(-pendingAdvance));
        }
        if (seg.size() > 0) {
            out.add(new COSString(seg.toByteArray()));
        }
        if (expectedGlyphs >= 0 && globalCode != expectedGlyphs) {
            return null;
        }
        return out;
    }

    /**
     * True if any image on the page overlaps a redaction rect (would survive under the overlay).
     */
    private static boolean imageIntersectsAnyRect(
            PDPage page, int pageIndex, List<PDRectangle> rects) {
        try {
            PageImageLocator locator = new PageImageLocator(page, pageIndex);
            locator.processPage(page);
            for (PageImageLocator.ImageBox ib : locator.getImageBoxes()) {
                Rectangle2D.Float img =
                        new Rectangle2D.Float(
                                ib.x1(), ib.y1(), ib.x2() - ib.x1(), ib.y2() - ib.y1());
                for (PDRectangle rect : rects) {
                    if (img.intersects(
                            rect.getLowerLeftX(),
                            rect.getLowerLeftY(),
                            rect.getWidth(),
                            rect.getHeight())) {
                        return true;
                    }
                }
            }
            return false;
        } catch (Exception e) {
            // Cannot prove no image sits under a box - treat as unsafe (force raster).
            return true;
        }
    }

    private static void writePageTokens(PDDocument document, PDPage page, List<Object> tokens)
            throws IOException {
        PDStream stream = new PDStream(document);
        try (var out = stream.createOutputStream(COSName.FLATE_DECODE)) {
            ContentStreamWriter writer = new ContentStreamWriter(out);
            writer.writeTokens(tokens);
        }
        page.setContents(stream);
    }

    static void drawOverlay(
            PDDocument document, PDPage page, List<PDRectangle> rects, Color overlayColor)
            throws IOException {
        try (PDPageContentStream cs =
                new PDPageContentStream(
                        document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {
            cs.saveGraphicsState();
            cs.setNonStrokingColor(overlayColor);
            for (PDRectangle rect : rects) {
                cs.addRect(
                        rect.getLowerLeftX(),
                        rect.getLowerLeftY(),
                        rect.getWidth(),
                        rect.getHeight());
            }
            cs.fill();
            cs.restoreGraphicsState();
        }
    }
}
