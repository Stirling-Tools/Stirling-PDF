package stirling.software.SPDF.pdf.redaction;

import java.awt.Color;
import java.awt.geom.Rectangle2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

import javax.imageio.ImageIO;

import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
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
import org.apache.pdfbox.pdmodel.font.PDTrueTypeFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.PDFTextStripperByArea;
import org.apache.pdfbox.text.TextPosition;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.pdf.parser.PageImageLocator;
import stirling.software.SPDF.utils.text.TextFinderUtils;

/** Shared plumbing for the manual-area, whole-page and auto-word redaction paths. */
@Slf4j
public final class RedactionPipeline {

    private static final Set<String> TEXT_SHOWING_OPERATORS = Set.of("Tj", "TJ", "'", "\"");
    private static final int MAX_XOBJECT_DEPTH = 10;

    // Latched false when the native PDFium binding can't load, so the host falls back to the PDFBox
    // pass.
    private static volatile boolean jpdfiumAvailable = true;

    // Skip the additive native pass above this size to bound off-heap copy + native runtime on
    // adversarial inputs; the PDFBox glyph-blind pass still verifies.
    private static final long MAX_JPDFIUM_VERIFY_BYTES = 100L * 1024 * 1024;

    private RedactionPipeline() {}

    /** Test hook to simulate the native binding being unavailable (drives the fail-closed path). */
    static void setJpdfiumAvailableForTest(boolean available) {
        jpdfiumAvailable = available;
    }

    /** Redact page-local rects (PDF user-space), dropping intersecting glyphs + overlay. */
    public static RedactionResult redactAreas(
            PDDocument document,
            Map<Integer, List<PDRectangle>> rectsByPageIndex,
            Color overlayColor)
            throws IOException {

        Set<String> capturedStrings = new LinkedHashSet<>();
        Set<Integer> forceRasterPages = new LinkedHashSet<>();

        for (Map.Entry<Integer, List<PDRectangle>> entry : rectsByPageIndex.entrySet()) {
            int pageIndex = entry.getKey();
            List<PDRectangle> rects = entry.getValue();
            if (pageIndex < 0 || pageIndex >= document.getNumberOfPages() || rects.isEmpty()) {
                continue;
            }
            PDPage page = document.getPage(pageIndex);
            capturedStrings.addAll(captureTextInRects(page, rects));

            // Rotation / non-zero CropBox origin break the coordinate flip, and text-bearing forms
            // or in-rect images defeat page-stream ordinal removal.
            boolean surgical =
                    isSurgicallySafe(page) && removeTokensIntersectingRects(document, page, rects);
            if (!surgical) {
                forceRasterPages.add(pageIndex);
            }
            removeOverlappingAnnotations(page, rects);
            drawOverlay(document, page, rects, overlayColor);
        }

        return new RedactionResult(capturedStrings, forceRasterPages);
    }

    /** True only for upright pages whose CropBox origin is (0,0), where the rect flip is exact. */
    private static boolean isSurgicallySafe(PDPage page) {
        if (page.getRotation() != 0) {
            return false;
        }
        PDRectangle crop = page.getCropBox();
        return crop.getLowerLeftX() == 0f && crop.getLowerLeftY() == 0f;
    }

    /** Drop annotations whose rectangle overlaps any redaction rect. */
    private static void removeOverlappingAnnotations(PDPage page, List<PDRectangle> rects) {
        try {
            List<org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation> kept =
                    new ArrayList<>();
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

    /** Wipe whole pages: drop all content/resources, fill with a rectangle. */
    public static void redactWholePages(
            PDDocument document, List<Integer> pageIndexes, Color overlayColor) throws IOException {
        for (Integer pageIndex : pageIndexes) {
            if (pageIndex == null || pageIndex < 0 || pageIndex >= document.getNumberOfPages()) {
                continue;
            }
            PDPage page = document.getPage(pageIndex);
            PDRectangle media = page.getMediaBox();

            // Drop existing content streams and page resources outright.
            page.getCOSObject().removeItem(COSName.CONTENTS);
            page.setResources(new PDResources());
            page.getCOSObject().removeItem(COSName.ANNOTS);
            // /Thumb is a rendered image of the original page - drop it too.
            page.getCOSObject().removeItem(COSName.getPDFName("Thumb"));

            try (PDPageContentStream cs =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.OVERWRITE, true, true)) {
                cs.setNonStrokingColor(overlayColor);
                cs.addRect(
                        media.getLowerLeftX(),
                        media.getLowerLeftY(),
                        media.getWidth(),
                        media.getHeight());
                cs.fill();
            }
        }
    }

    /** Physically remove every literal/regex match from all page content streams. */
    public static void redactLiteralTerms(
            PDDocument document, Set<String> literalTargets, List<Pattern> patterns)
            throws IOException {
        List<Pattern> effectivePatterns = effectivePatterns(literalTargets, patterns);
        if (effectivePatterns.isEmpty()) {
            return;
        }
        int pageIndex = 0;
        for (PDPage page : document.getPages()) {
            try {
                rewritePageContent(document, page, effectivePatterns);
            } catch (IOException | RuntimeException e) {
                // Never let one page's font quirk (e.g. Type3 encode, damaged program)
                log.warn(
                        "Content-stream rewrite failed on page {} ({}); leaving it for the "
                                + "verification/rasterisation pass.",
                        pageIndex + 1,
                        e.toString());
            }
            pageIndex++;
        }
    }

    /** Finalize with document-wide verification: scrub, wipe metadata, save, verify. */
    public static byte[] finalize(
            PDDocument document, Set<String> literalTargets, List<Pattern> patterns)
            throws IOException {
        return finalize(document, literalTargets, patterns, null);
    }

    /** Finalize with verification scoped to a specific set of page indexes. */
    public static byte[] finalize(
            PDDocument document,
            Set<String> literalTargets,
            List<Pattern> patterns,
            Set<Integer> affectedPages)
            throws IOException {

        CatalogScrubber.scrub(document, literalTargets, patterns);
        CatalogScrubber.wipeMetadata(document);
        warnAboutEmbeddedFontGlyphs(document);

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        byte[] bytes = baos.toByteArray();

        try {
            verify(bytes, literalTargets, patterns, affectedPages);
            return bytes;
        } catch (RedactionVerificationFailedException primaryFailure) {
            // Rewriter could not guarantee removal; rasterise as a last resort.
            log.warn(
                    "Primary redaction verification failed ({}); falling back to page-scoped "
                            + "rasterisation to guarantee removal.",
                    primaryFailure.getMessage());
            // With no page scope (auto-word), rasterise only the pages that still leak.
            Set<Integer> pagesToRaster =
                    (affectedPages == null || affectedPages.isEmpty())
                            ? findLeakingPages(bytes, literalTargets, patterns)
                            : new HashSet<>(affectedPages);
            try (PDDocument rasterised = rasterisePages(bytes, pagesToRaster)) {
                CatalogScrubber.scrub(rasterised, literalTargets, patterns);
                CatalogScrubber.wipeMetadata(rasterised);
                ByteArrayOutputStream rasterOut = new ByteArrayOutputStream();
                rasterised.save(rasterOut);
                byte[] rasterBytes = rasterOut.toByteArray();
                verify(rasterBytes, literalTargets, patterns, affectedPages);
                return rasterBytes;
            } catch (IOException e) {
                throw new RedactionVerificationFailedException(
                        "Rasterisation fallback failed after primary redaction leak", e);
            }
        }
    }

    /** Finalize a manual area redaction; rasterises forced + verified-leaking pages. */
    public static byte[] finalizeAreas(
            PDDocument document,
            Map<Integer, List<PDRectangle>> rectsByPage,
            Set<Integer> forceRasterPages,
            Set<String> capturedTargets)
            throws IOException {

        // Text captured under the rects may also live in a bookmark / form value / annotation / JS
        // carrier.
        Set<String> carrierTargets =
                capturedTargets == null ? Collections.emptySet() : capturedTargets;
        CatalogScrubber.scrub(document, carrierTargets, Collections.emptyList());
        CatalogScrubber.wipeMetadata(document);
        warnAboutEmbeddedFontGlyphs(document);

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        byte[] bytes = baos.toByteArray();

        Set<Integer> toRaster =
                new HashSet<>(forceRasterPages == null ? Set.of() : forceRasterPages);
        toRaster.addAll(findLeakingRectPages(bytes, rectsByPage));
        if (toRaster.isEmpty()) {
            return bytes;
        }
        log.warn("Manual redaction rasterising page(s) {} to guarantee removal", toRaster);
        try (PDDocument rasterised = rasterisePages(bytes, toRaster)) {
            CatalogScrubber.wipeMetadata(rasterised);
            ByteArrayOutputStream rasterOut = new ByteArrayOutputStream();
            rasterised.save(rasterOut);
            return rasterOut.toByteArray();
        } catch (IOException e) {
            throw new RedactionVerificationFailedException(
                    "Rasterisation fallback failed after manual redaction leak", e);
        }
    }

    /**
     * Rasterise the given pages of already-finalized bytes to guarantee removal of geometric (range
     * / image-box) redactions whose covered content - text under an overlay, or an image - is not
     * removed by content-stream text redaction. Scrubs carriers and re-saves.
     */
    public static byte[] rasteriseSpecificPages(
            byte[] bytes, Set<Integer> pages, Set<String> literalTargets, List<Pattern> patterns)
            throws IOException {
        if (pages == null || pages.isEmpty()) {
            return bytes;
        }
        log.warn("Rasterising page(s) {} to guarantee geometric redaction removal", pages);
        try (PDDocument rasterised = rasterisePages(bytes, new HashSet<>(pages))) {
            CatalogScrubber.scrub(rasterised, literalTargets, patterns);
            CatalogScrubber.wipeMetadata(rasterised);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            rasterised.save(out);
            return out.toByteArray();
        }
    }

    /** Redacted pages that still show text inside a rect or carry an overlapping annotation. */
    private static Set<Integer> findLeakingRectPages(
            byte[] bytes, Map<Integer, List<PDRectangle>> rectsByPage) {
        Set<Integer> leaking = new HashSet<>();
        if (rectsByPage == null || rectsByPage.isEmpty()) {
            return leaking;
        }
        try (PDDocument reopened = org.apache.pdfbox.Loader.loadPDF(bytes)) {
            for (Map.Entry<Integer, List<PDRectangle>> entry : rectsByPage.entrySet()) {
                int pageIndex = entry.getKey();
                if (pageIndex < 0 || pageIndex >= reopened.getNumberOfPages()) {
                    continue;
                }
                PDPage page = reopened.getPage(pageIndex);
                boolean textLeft =
                        captureTextInRects(page, entry.getValue()).stream()
                                .anyMatch(s -> s != null && !s.isBlank());
                if (textLeft || annotationOverlapsRect(page, entry.getValue())) {
                    leaking.add(pageIndex);
                }
            }
        } catch (IOException e) {
            // Cannot verify - rasterise every redacted page to be safe.
            return new HashSet<>(rectsByPage.keySet());
        }
        return leaking;
    }

    private static boolean annotationOverlapsRect(PDPage page, List<PDRectangle> rects) {
        try {
            for (var ann : page.getAnnotations()) {
                PDRectangle ar = ann.getRectangle();
                if (ar == null) {
                    continue;
                }
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
                        return true;
                    }
                }
            }
        } catch (Exception e) {
            return true;
        }
        return false;
    }

    private static List<Pattern> effectivePatterns(
            Set<String> literalTargets, List<Pattern> patterns) {
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

    private static void rewritePageContent(PDDocument document, PDPage page, List<Pattern> patterns)
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
            } else if (TEXT_SHOWING_OPERATORS.contains(name) && i >= 1) {
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

    // Rasterisation fallback

    /** Rasterise the listed pages (all when null) at 150 DPI, replacing their content. */
    private static PDDocument rasterisePages(byte[] sourceBytes, Set<Integer> pagesToRaster)
            throws IOException {
        // Load the document directly and mutate in place: rewriting
        PDDocument source = org.apache.pdfbox.Loader.loadPDF(sourceBytes);
        try {
            PDFRenderer renderer = new PDFRenderer(source);
            int pageCount = source.getNumberOfPages();
            for (int i = 0; i < pageCount; i++) {
                if (pagesToRaster != null && !pagesToRaster.contains(i)) {
                    continue;
                }
                PDPage page = source.getPage(i);
                // PDFRenderer renders the CropBox region, so draw the raster over the CropBox (not
                // the MediaBox) or a CropBox != MediaBox page is stretched/offset.
                PDRectangle crop = page.getCropBox();

                BufferedImage img = renderer.renderImageWithDPI(i, 150, ImageType.RGB);
                ByteArrayOutputStream imgOut = new ByteArrayOutputStream();
                ImageIO.write(img, "png", imgOut);
                PDImageXObject imageXObject =
                        PDImageXObject.createFromByteArray(
                                source, imgOut.toByteArray(), "redacted-page-" + i);

                // Drop all prior content / resources / annotations / thumbnail; the raster is the
                // page.
                page.getCOSObject().removeItem(COSName.CONTENTS);
                page.setResources(new PDResources());
                page.getCOSObject().removeItem(COSName.ANNOTS);
                page.getCOSObject().removeItem(COSName.getPDFName("Thumb"));
                // Rotation is already baked into the rendered image, so reset it to zero.
                page.setRotation(0);

                try (PDPageContentStream cs =
                        new PDPageContentStream(
                                source,
                                page,
                                PDPageContentStream.AppendMode.OVERWRITE,
                                false,
                                true)) {
                    // The rendered image already has the rotation baked in visually
                    cs.drawImage(
                            imageXObject,
                            crop.getLowerLeftX(),
                            crop.getLowerLeftY(),
                            crop.getWidth(),
                            crop.getHeight());
                }
            }
            return source;
        } catch (IOException | RuntimeException e) {
            source.close();
            throw e;
        }
    }

    // Pattern construction

    /** Build case-insensitive regex patterns from user input. */
    public static List<Pattern> buildPatterns(
            String[] rawEntries, boolean useRegex, boolean wholeWordSearch) {
        List<Pattern> patterns = new ArrayList<>();
        if (rawEntries == null) {
            return patterns;
        }
        for (String raw : rawEntries) {
            if (raw == null) {
                continue;
            }
            String trimmed = raw.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            try {
                String core = useRegex ? trimmed : Pattern.quote(trimmed);
                if (wholeWordSearch) {
                    // Shared with the finder so removal + verification use identical boundaries.
                    core = TextFinderUtils.applyWordBoundaries(trimmed, core);
                }
                patterns.add(
                        Pattern.compile(core, Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE));
            } catch (PatternSyntaxException e) {
                log.debug("Skipping invalid regex '{}': {}", trimmed, e.getMessage());
            }
        }
        return patterns;
    }

    // Area capture

    private static List<String> captureTextInRects(PDPage page, List<PDRectangle> rects)
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
    private static boolean removeTokensIntersectingRects(
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
        Set<Integer> dropTokenIndexes = collector.tokenIndexesToDrop;
        int collectorTextOps = collector.totalTextOps();

        List<Object> tokens = parseTokens(new PDFStreamParser(page));
        Set<Integer> blankArgIndexes = new HashSet<>();
        int pageTextOps = 0;
        for (int i = 0; i < tokens.size(); i++) {
            Object t = tokens.get(i);
            if (t instanceof Operator op && TEXT_SHOWING_OPERATORS.contains(op.getName())) {
                if (dropTokenIndexes.contains(pageTextOps) && i > 0) {
                    blankArgIndexes.add(i - 1);
                }
                pageTextOps++;
            }
        }

        // Collector ordinals span form XObjects.
        if (collectorTextOps != pageTextOps || imageIntersectsAnyRect(page, pageIndex, rects)) {
            return false;
        }

        for (Integer idx : blankArgIndexes) {
            Object arg = tokens.get(idx);
            if (arg instanceof COSString) {
                tokens.set(idx, new COSString(""));
            } else if (arg instanceof COSArray arr) {
                COSArray empty = new COSArray();
                // Preserve numeric kerning entries so page layout doesn't shift wildly.
                for (COSBase element : arr) {
                    if (!(element instanceof COSString)) {
                        empty.add(element);
                    }
                }
                tokens.set(idx, empty);
            }
        }

        writePageTokens(document, page, tokens);
        return true;
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

    private static void drawOverlay(
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

    // Font subsetting

    /** Warns when the document still carries embedded Type0/TrueType font */
    private static void warnAboutEmbeddedFontGlyphs(PDDocument document) {
        boolean anyEmbedded = false;
        Set<PDFont> visited = new HashSet<>();
        for (PDPage page : document.getPages()) {
            PDResources resources = page.getResources();
            if (resources == null) {
                continue;
            }
            for (COSName name : resources.getFontNames()) {
                PDFont font;
                try {
                    font = resources.getFont(name);
                } catch (IOException ioe) {
                    continue;
                }
                if (font == null || !visited.add(font)) {
                    continue;
                }
                if (font instanceof PDType0Font || font instanceof PDTrueTypeFont) {
                    anyEmbedded = true;
                }
            }
        }
        if (anyEmbedded) {
            log.warn(
                    "Redacted document contains embedded Type0/TrueType fonts; glyph outlines for "
                            + "redacted characters may remain in the font program. Text is not "
                            + "extractable via content-stream reading, but raw font inspection can "
                            + "still recover glyph shapes. Use the convert-to-image fallback for "
                            + "maximum assurance.");
        }
    }

    // Verification

    private static void verify(
            byte[] bytes,
            Set<String> literalTargets,
            List<Pattern> patterns,
            Set<Integer> affectedPages) {
        if ((literalTargets == null || literalTargets.isEmpty())
                && (patterns == null || patterns.isEmpty())) {
            return;
        }
        Set<Integer> pageSet =
                (affectedPages == null || affectedPages.isEmpty())
                        ? null
                        : new TreeSet<>(affectedPages);
        // PDFBox pass, blind to /ActualText so a benign override can't mask real glyphs.
        boolean needNativePass;
        try (PDDocument reopened = org.apache.pdfbox.Loader.loadPDF(bytes)) {
            assertNoTarget(extractText(reopened, pageSet), literalTargets, patterns);
            needNativePass = documentHasUnreliableFont(reopened);
        } catch (IOException e) {
            throw new RedactionVerificationFailedException(
                    "Failed to reopen redacted PDF for verification", e);
        }
        // Additive producer-independent pass: native PDFium sees glyphs PDFBox may miss (fonts with
        // no ToUnicode).
        if (needNativePass) {
            String nativeText = extractTextJPDFium(bytes, pageSet);
            if (nativeText == null) {
                // Required independent pass could not run (native unavailable or doc over the size
                // guard); fail closed.
                throw new RedactionVerificationFailedException(
                        "Independent native verification could not run for a document whose fonts "
                                + "PDFBox cannot reliably extract; cannot confirm removal");
            }
            assertNoTarget(nativeText, literalTargets, patterns);
        }
    }

    /**
     * True if any font (on any page or nested form XObject) is not provably reliable for PDFBox
     * glyph extraction - i.e. it is neither a built-in Standard-14 font nor carries a /ToUnicode
     * map. These are exactly the fonts (CID/Type3/symbolic without ToUnicode) where the PDFBox pass
     * can go blind, so the independent native pass earns its cost. Biased to {@code true} on any
     * inspection failure so the native pass runs whenever reliability is uncertain.
     */
    static boolean documentHasUnreliableFont(PDDocument document) {
        try {
            Set<COSBase> visited = new HashSet<>();
            for (PDPage page : document.getPages()) {
                if (resourcesHaveUnreliableFont(page.getResources(), visited, 0)) {
                    return true;
                }
            }
            return false;
        } catch (RuntimeException e) {
            return true;
        }
    }

    private static boolean resourcesHaveUnreliableFont(
            PDResources res, Set<COSBase> visited, int depth) {
        if (res == null) {
            return false;
        }
        if (depth > MAX_XOBJECT_DEPTH) {
            return true; // too deeply nested to fully verify - run the native pass to be safe
        }
        if (!visited.add(res.getCOSObject())) {
            return false; // already inspected this resource dictionary
        }
        for (COSName name : res.getFontNames()) {
            PDFont font;
            try {
                font = res.getFont(name);
            } catch (Exception e) {
                return true; // font won't load for inspection - assume unreliable
            }
            // Reliable only for built-in Standard-14 fonts or a /ToUnicode map we can trust.
            if (font != null
                    && !font.isStandard14()
                    && (!font.getCOSObject().containsKey(COSName.TO_UNICODE)
                            || isSubsetFont(font))) {
                return true;
            }
        }
        for (COSName name : res.getXObjectNames()) {
            try {
                if (res.getXObject(name) instanceof PDFormXObject form
                        && resourcesHaveUnreliableFont(form.getResources(), visited, depth + 1)) {
                    return true;
                }
            } catch (Exception e) {
                return true; // can't inspect the XObject - assume unreliable
            }
        }
        return false;
    }

    /**
     * A subset-embedded font carries a 6-uppercase-letter '+' BaseFont tag (e.g. {@code ABCDEF+}).
     * Its /ToUnicode is custom-built and cannot be trusted for the reliability gate: a partial map
     * silently loses text, and a crafted map can defeat text-based redaction entirely (only
     * convert-to-image fully mitigates that adversarial case).
     */
    private static boolean isSubsetFont(PDFont font) {
        String name = font.getName();
        if (name == null || name.length() < 8 || name.charAt(6) != '+') {
            return false;
        }
        for (int i = 0; i < 6; i++) {
            char c = name.charAt(i);
            if (c < 'A' || c > 'Z') {
                return false;
            }
        }
        return true;
    }

    /** Fail-closed match check with whitespace-normalised literals and X2 regex semantics. */
    private static void assertNoTarget(
            String extracted, Set<String> literalTargets, List<Pattern> patterns) {
        if (extracted == null) {
            return;
        }
        String normalised = extracted.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
        // De-hyphenated view catches a target split by a soft hyphen (U+00AD) or a line-break
        // hyphen ("-" + space).
        String dehyphenated = normalised.replace("\u00ad", "").replaceAll("-\\s+", "");
        if (literalTargets != null) {
            for (String target : literalTargets) {
                if (target == null || target.isEmpty()) {
                    continue;
                }
                String needle = target.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
                if (normalised.contains(needle) || dehyphenated.contains(needle)) {
                    throw new RedactionVerificationFailedException(
                            "Redacted text still extractable: '" + target + "'");
                }
            }
        }
        if (patterns != null) {
            for (Pattern pattern : patterns) {
                try {
                    if (pattern.matcher(DeadlineCharSequence.of(extracted)).find()) {
                        throw new RedactionVerificationFailedException(
                                "Redacted pattern still extractable: " + pattern.pattern());
                    }
                } catch (RedactionVerificationFailedException rvf) {
                    throw rvf;
                } catch (RuntimeException | StackOverflowError e) {
                    throw new RedactionVerificationFailedException(
                            "Verification regex failed ("
                                    + pattern.pattern()
                                    + "): "
                                    + e.getMessage(),
                            e instanceof Exception ? (Exception) e : new Exception(e));
                }
            }
        }
    }

    /** Extract text from pageIndexes (0-based) using an /ActualText-blind stripper. */
    private static String extractText(PDDocument document, Set<Integer> pageIndexes)
            throws IOException {
        PDFTextStripper stripper = new GlyphOnlyTextStripper();
        if (pageIndexes == null) {
            return stripper.getText(document);
        }
        StringBuilder out = new StringBuilder();
        for (Integer pageIdx : pageIndexes) {
            if (pageIdx == null || pageIdx < 0 || pageIdx >= document.getNumberOfPages()) {
                continue;
            }
            stripper.setStartPage(pageIdx + 1);
            stripper.setEndPage(pageIdx + 1);
            String pageText = stripper.getText(document);
            if (pageText != null) {
                out.append(pageText);
            }
        }
        return out.toString();
    }

    /**
     * Independent native (PDFium) extraction; null if the binding is unavailable (additive only).
     */
    private static String extractTextJPDFium(byte[] bytes, Set<Integer> pageIndexes) {
        if (!jpdfiumAvailable || bytes.length > MAX_JPDFIUM_VERIFY_BYTES) {
            return null;
        }
        try (stirling.software.jpdfium.PdfDocument doc =
                stirling.software.jpdfium.PdfDocument.open(bytes)) {
            StringBuilder sb = new StringBuilder();
            int n = doc.pageCount();
            if (pageIndexes == null) {
                for (int i = 0; i < n; i++) {
                    sb.append(jpdfiumPlainText(doc, i)).append('\n');
                }
            } else {
                for (Integer p : pageIndexes) {
                    if (p != null && p >= 0 && p < n) {
                        sb.append(jpdfiumPlainText(doc, p)).append('\n');
                    }
                }
            }
            return sb.toString();
        } catch (RuntimeException | Error e) {
            onJpdfiumFailure(e);
            return null;
        }
    }

    private static String jpdfiumPlainText(stirling.software.jpdfium.PdfDocument doc, int i) {
        try {
            return stirling.software.jpdfium.text.PdfTextExtractor.extractPage(doc, i).plainText();
        } catch (RuntimeException | Error e) {
            return "";
        }
    }

    /** One native open, all pages' plain text; null if the binding is unavailable. */
    private static List<String> extractPagesJPDFium(byte[] bytes) {
        if (!jpdfiumAvailable || bytes.length > MAX_JPDFIUM_VERIFY_BYTES) {
            return null;
        }
        try (stirling.software.jpdfium.PdfDocument doc =
                stirling.software.jpdfium.PdfDocument.open(bytes)) {
            List<String> pages = new ArrayList<>();
            int n = doc.pageCount();
            for (int i = 0; i < n; i++) {
                pages.add(jpdfiumPlainText(doc, i));
            }
            return pages;
        } catch (RuntimeException | Error e) {
            onJpdfiumFailure(e);
            return null;
        }
    }

    /**
     * A native-binding load error latches the pass off process-wide (warn once) so a host without
     * the native stops retrying; a per-document error only skips this one document (debug).
     */
    private static void onJpdfiumFailure(Throwable e) {
        boolean nativeUnavailable =
                e instanceof UnsatisfiedLinkError
                        || e instanceof NoClassDefFoundError
                        || e instanceof ExceptionInInitializerError
                        || e.getClass().getSimpleName().contains("NativeLoad");
        if (nativeUnavailable) {
            jpdfiumAvailable = false;
            log.warn(
                    "JPDFium native unavailable; redaction verification will use the PDFBox pass "
                            + "only: {}",
                    e.toString());
        } else {
            log.debug("JPDFium verification skipped for this document: {}", e.toString());
        }
    }

    /** Pages whose surviving text (PDFBox glyph-blind OR native PDFium) still matches a target. */
    private static Set<Integer> findLeakingPages(
            byte[] bytes, Set<String> literalTargets, List<Pattern> patterns) {
        List<String> jpdfiumPages = extractPagesJPDFium(bytes);
        try (PDDocument reopened = org.apache.pdfbox.Loader.loadPDF(bytes)) {
            // Native pass required but unavailable: PDFBox can't localise the leak, so rasterise
            // every page.
            if (jpdfiumPages == null && documentHasUnreliableFont(reopened)) {
                log.warn(
                        "Independent native pass unavailable on an unreliable-font document; "
                                + "rasterising all pages to guarantee removal.");
                return null;
            }
            Set<Integer> leaking = new TreeSet<>();
            GlyphOnlyTextStripper stripper = new GlyphOnlyTextStripper();
            for (int i = 0; i < reopened.getNumberOfPages(); i++) {
                stripper.setStartPage(i + 1);
                stripper.setEndPage(i + 1);
                String pdfboxText = stripper.getText(reopened);
                String jpdfiumText =
                        jpdfiumPages != null && i < jpdfiumPages.size() ? jpdfiumPages.get(i) : "";
                String combined = (pdfboxText == null ? "" : pdfboxText) + "\n" + jpdfiumText;
                if (pageLeaks(combined, literalTargets, patterns)) {
                    leaking.add(i);
                }
            }
            if (leaking.isEmpty()) {
                log.warn(
                        "Verification failed but no single page leaks in isolation; rasterising "
                                + "all pages to be safe.");
                return null;
            }
            log.info("Leak detection: rasterising only page(s) {}", leaking);
            return leaking;
        } catch (Exception e) {
            log.warn("Per-page leak detection failed ({}); rasterising all pages.", e.toString());
            return null;
        }
    }

    private static boolean pageLeaks(
            String pageText, Set<String> literalTargets, List<Pattern> patterns) {
        try {
            assertNoTarget(pageText, literalTargets, patterns);
            return false;
        } catch (RedactionVerificationFailedException e) {
            return true;
        }
    }

    /** PDFTextStripper that strips /ActualText so verification sees the real glyph stream. */
    private static final class GlyphOnlyTextStripper extends PDFTextStripper {
        private static final COSName ACTUAL_TEXT = COSName.getPDFName("ActualText");

        GlyphOnlyTextStripper() throws IOException {}

        @Override
        public void beginMarkedContentSequence(COSName tag, COSDictionary properties) {
            COSDictionary safe = properties;
            if (properties != null && properties.containsKey(ACTUAL_TEXT)) {
                safe = new COSDictionary(properties);
                safe.removeItem(ACTUAL_TEXT);
            }
            super.beginMarkedContentSequence(tag, safe);
        }
    }

    // Helper types

    /** Captured strings plus pages that must be rasterised (surgical removal was unreliable). */
    public static final class RedactionResult {
        private final Set<String> capturedStrings;
        private final Set<Integer> forceRasterPages;

        public RedactionResult(Set<String> capturedStrings, Set<Integer> forceRasterPages) {
            this.capturedStrings = capturedStrings == null ? Set.of() : capturedStrings;
            this.forceRasterPages = forceRasterPages == null ? Set.of() : forceRasterPages;
        }

        public Set<String> getCapturedStrings() {
            return capturedStrings;
        }

        public Set<Integer> getForceRasterPages() {
            return forceRasterPages;
        }
    }

    /** A PDFTextStripper subclass that records the ordinal index of every */
    private static final class TokenIndexCollector extends PDFTextStripper {
        private final List<Rectangle2D.Float> rects;
        private final Set<Integer> tokenIndexesToDrop = new HashSet<>();
        private int showTextOpCounter = -1;
        private boolean currentOpInRect = false;

        TokenIndexCollector(List<Rectangle2D.Float> rects) throws IOException {
            this.rects = rects;
            setSortByPosition(false);
        }

        int totalTextOps() {
            return showTextOpCounter + 1;
        }

        @Override
        protected void processTextPosition(TextPosition text) {
            // PDFBox reports coordinates with top-left origin here.
            float x = text.getX();
            float y = text.getY() - text.getHeight();
            Rectangle2D.Float glyph =
                    new Rectangle2D.Float(x, y, text.getWidth(), text.getHeight());
            for (Rectangle2D.Float rect : rects) {
                if (rect.intersects(glyph)) {
                    currentOpInRect = true;
                    return;
                }
            }
            super.processTextPosition(text);
        }

        @Override
        protected void processOperator(Operator operator, List<COSBase> operands)
                throws IOException {
            String name = operator.getName();
            boolean textOp = TEXT_SHOWING_OPERATORS.contains(name);
            if (textOp) {
                showTextOpCounter++;
                currentOpInRect = false;
            }
            super.processOperator(operator, operands);
            if (textOp && currentOpInRect) {
                tokenIndexesToDrop.add(showTextOpCounter);
            }
        }
    }
}
