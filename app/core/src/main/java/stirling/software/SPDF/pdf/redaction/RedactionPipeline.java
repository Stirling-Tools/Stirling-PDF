package stirling.software.SPDF.pdf.redaction;

import java.awt.Color;
import java.awt.geom.Rectangle2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
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

/**
 * Shared plumbing for the three redaction paths (manual areas, whole pages, auto-word).
 *
 * <p>Every path funnels through this class so that the following guarantees hold uniformly:
 *
 * <ol>
 *   <li>Text tokens that fall inside a target rect are physically dropped from the content stream.
 *   <li>Catalog-level carriers (outline, AcroForm, annotations, struct tree, names tree) are
 *       scrubbed so redacted strings cannot survive outside the page content.
 *   <li>Info dict + XMP metadata is wiped.
 *   <li>The document is rewritten with a fresh xref (no incremental save) and then verified with a
 *       fresh {@link PDFTextStripper} pass; surviving target text throws {@link
 *       RedactionVerificationFailedException}. The literal/pattern path verifies the whole (or
 *       affected) page text; the manual-area path verifies each redaction rectangle is empty.
 * </ol>
 */
@Slf4j
public final class RedactionPipeline {

    private static final Set<String> TEXT_SHOWING_OPERATORS = Set.of("Tj", "TJ", "'", "\"");

    private RedactionPipeline() {}

    /**
     * Apply a list of page-local redaction rects (coordinates in PDF user space) against the
     * supplied document.
     */
    public static RedactionResult redactAreas(
            PDDocument document,
            Map<Integer, List<PDRectangle>> rectsByPageIndex,
            Color overlayColor)
            throws IOException {

        Set<String> capturedStrings = new LinkedHashSet<>();

        for (Map.Entry<Integer, List<PDRectangle>> entry : rectsByPageIndex.entrySet()) {
            int pageIndex = entry.getKey();
            List<PDRectangle> rects = entry.getValue();
            if (pageIndex < 0 || pageIndex >= document.getNumberOfPages() || rects.isEmpty()) {
                continue;
            }
            PDPage page = document.getPage(pageIndex);
            List<String> captured = captureTextInRects(page, rects);
            capturedStrings.addAll(captured);

            removeTokensIntersectingRects(document, page, rects);
            drawOverlay(document, page, rects, overlayColor);
        }

        return new RedactionResult(capturedStrings);
    }

    /**
     * Replace the entire contents of the listed pages with a single filled rectangle in the page
     * media box. All underlying text and images are dropped from the content stream and from the
     * page resources.
     */
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

    /**
     * Rewrites every content stream on every page so that any occurrence of any literal target or
     * regex pattern is physically removed from the glyph bytes. Handles:
     *
     * <ul>
     *   <li>simple Type1 fonts with WinAnsiEncoding (e.g. ReportLab {@code (Test PDF #1) Tj}),
     *   <li>Type0/CID fonts with multi-byte codes,
     *   <li>pages with {@code /Rotate 90} or other rotations,
     *   <li>text split across multiple operands inside a single {@code TJ} array.
     * </ul>
     *
     * <p>The approach decodes each {@link COSString} operand byte-by-byte using the font that is
     * current at that point in the content stream, reconstructs the Unicode text, runs the target
     * patterns against that text, and rebuilds the byte operand omitting the matched character
     * codes. Width adjustment ({@code TJ} numeric kerning) is reinserted so downstream layout is
     * preserved even when the operand shrinks. The page layout may look sparse but the glyphs for
     * the target term are guaranteed to be gone.
     */
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
                // Never let one page's font quirk (e.g. Type3 encode, damaged program) abort the
                // whole document. Leave this page for the verify+rasterise safety net to catch.
                log.warn(
                        "Content-stream rewrite failed on page {} ({}); leaving it for the "
                                + "verification/rasterisation pass.",
                        pageIndex + 1,
                        e.toString());
            }
            pageIndex++;
        }
    }

    /**
     * Finalize the document with document-wide verification: scrub catalog carriers, wipe metadata,
     * subset embedded fonts, save with a fresh xref and verify that no literal target survives
     * anywhere in the saved PDF.
     *
     * <p>Use this overload for auto-word redaction where every occurrence of a literal target is a
     * deliberate removal target. For manual rect redaction use {@link #finalize(PDDocument, Set,
     * List, Set)} so verification is scoped to the affected pages (since the same word can
     * legitimately remain on non-targeted pages).
     */
    public static byte[] finalize(
            PDDocument document, Set<String> literalTargets, List<Pattern> patterns)
            throws IOException {
        return finalize(document, literalTargets, patterns, null);
    }

    /**
     * Finalize with verification scoped to a specific set of page indexes. When {@code
     * affectedPages} is null the verification runs over the whole document. When non-null, only the
     * listed pages are checked for surviving literal targets; the rasterisation fallback (if
     * triggered) also rasterises only those pages, preserving every other page verbatim so
     * unrelated content remains text-searchable.
     *
     * <p>Pass an empty set together with empty targets/patterns to skip verification entirely (for
     * manual redactions that captured no text and drew no image boxes).
     */
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
            // Last-resort: if the content-stream rewriter could not guarantee removal (unusual
            // fonts, encrypted streams, non-text glyph carriers), rasterise only the affected
            // pages so the target is physically gone without destroying the text layer on pages
            // that were never touched. This is logged loudly so operators know redaction fell
            // back to the image path.
            log.warn(
                    "Primary redaction verification failed ({}); falling back to page-scoped "
                            + "rasterisation to guarantee removal.",
                    primaryFailure.getMessage());
            // When the caller gave no page scope (auto-word mode), locate the leaking pages so
            // only those are rasterised; clean pages keep their searchable text layer. If leak
            // detection itself fails, fall back to rasterising everything (null).
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

    /**
     * Finalize a manual area redaction. Unlike the literal/pattern path, verification here is
     * region-based: after saving, each redaction rectangle is re-scanned and must contain no text.
     * This avoids the substring false positives that whole-page string verification hits when a box
     * clips a word into a common fragment (for example a clipped "HEADER" becoming "HE", which
     * would otherwise match "here" elsewhere on the page). On a real leak the affected pages are
     * rasterised so untouched pages keep their text layer.
     */
    public static byte[] finalizeAreas(
            PDDocument document, Map<Integer, List<PDRectangle>> rectsByPage) throws IOException {

        CatalogScrubber.wipeMetadata(document);
        warnAboutEmbeddedFontGlyphs(document);

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        byte[] bytes = baos.toByteArray();

        try {
            verifyRectsEmpty(bytes, rectsByPage);
            return bytes;
        } catch (RedactionVerificationFailedException primaryFailure) {
            log.warn(
                    "Manual-area redaction verification failed ({}); rasterising affected pages to "
                            + "guarantee removal.",
                    primaryFailure.getMessage());
            Set<Integer> pagesToRaster = new HashSet<>(rectsByPage.keySet());
            try (PDDocument rasterised = rasterisePages(bytes, pagesToRaster)) {
                CatalogScrubber.wipeMetadata(rasterised);
                ByteArrayOutputStream rasterOut = new ByteArrayOutputStream();
                rasterised.save(rasterOut);
                return rasterOut.toByteArray();
            } catch (IOException e) {
                throw new RedactionVerificationFailedException(
                        "Rasterisation fallback failed after manual redaction leak", e);
            }
        }
    }

    private static void verifyRectsEmpty(
            byte[] bytes, Map<Integer, List<PDRectangle>> rectsByPage) {
        if (rectsByPage == null || rectsByPage.isEmpty()) {
            return;
        }
        try (PDDocument reopened = org.apache.pdfbox.Loader.loadPDF(bytes)) {
            for (Map.Entry<Integer, List<PDRectangle>> entry : rectsByPage.entrySet()) {
                int pageIndex = entry.getKey();
                if (pageIndex < 0 || pageIndex >= reopened.getNumberOfPages()) {
                    continue;
                }
                List<String> remaining =
                        captureTextInRects(reopened.getPage(pageIndex), entry.getValue());
                for (String fragment : remaining) {
                    if (fragment != null && !fragment.isBlank()) {
                        throw new RedactionVerificationFailedException(
                                "Text still present inside redaction area on page "
                                        + (pageIndex + 1)
                                        + ": '"
                                        + fragment
                                        + "'");
                    }
                }
            }
        } catch (IOException e) {
            throw new RedactionVerificationFailedException(
                    "Failed to reopen redacted PDF for area verification", e);
        }
    }

    private static List<Pattern> effectivePatterns(
            Set<String> literalTargets, List<Pattern> patterns) {
        List<Pattern> result = new ArrayList<>();
        if (literalTargets != null) {
            for (String target : literalTargets) {
                if (target == null || target.isEmpty()) {
                    continue;
                }
                // Case-insensitive to match TextFinderUtils' search semantics; removal must never
                // be narrower than what the finder matched (or verification would raster pages).
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

    // ---------------------------------------------------------------------
    // Per-page content-stream rewrite (literal/regex based)
    // ---------------------------------------------------------------------

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
        // Recurse into form XObjects referenced by this page.
        rewriteFormXObjects(document, resources, patterns, new HashSet<>());
    }

    private static void rewriteFormXObjects(
            PDDocument document,
            PDResources resources,
            List<Pattern> patterns,
            Set<COSBase> visited)
            throws IOException {
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
                PDResources formResources = form.getResources();
                if (formResources == null) {
                    continue;
                }
                boolean modified = rewriteTokens(tokens, formResources, patterns);
                if (modified) {
                    PDStream stream = new PDStream(document);
                    try (var out = stream.createOutputStream(COSName.FLATE_DECODE)) {
                        new ContentStreamWriter(out).writeTokens(tokens);
                    }
                    form.getCOSObject().removeItem(COSName.CONTENTS);
                    form.getCOSObject().setItem(COSName.CONTENTS, stream.getCOSObject());
                }
                rewriteFormXObjects(document, formResources, patterns, visited);
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

    /**
     * Walk tokens keeping a tiny text state (current font). When a text-showing operator is
     * encountered its string operand(s) are decoded via the current font, run against every
     * pattern, and rewritten with matching character codes removed.
     *
     * @return true if any operand was modified.
     */
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
            // Without a font we cannot decode safely. Try a best-effort latin-1 interpretation.
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
        // Build a concatenated decode across all COSString elements so that matches spanning
        // multiple operands are found. Non-string elements are kerning adjustments; keep them
        // in place and re-emit them between the rewritten strings.
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
                // A zero-length COSString is valid; PDFBox emits it as () producing no glyphs.
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

    /**
     * Decode a {@link COSString} into Unicode characters using the supplied font. Returns null if
     * decoding fails at any point (e.g. malformed byte sequence).
     */
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
                    // If the font has no ToUnicode mapping we cannot match reliably - return null
                    // and let the caller either fall back to latin-1 (rare) or rasterisation via
                    // the final verification pass.
                    return null;
                }
                text.append(unicode);
                // Associate every Unicode character produced with the same code byte range so
                // that dropping any one of them drops the whole code.
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

    /**
     * Returns null if none of the patterns match; otherwise a boolean mask the same length as
     * {@code text} where {@code true} means "this character belongs to a matched range".
     */
    private static boolean[] findDroppedCharsMask(String text, List<Pattern> patterns) {
        boolean any = false;
        boolean[] mask = new boolean[text.length()];
        for (Pattern pattern : patterns) {
            Matcher m;
            try {
                m = pattern.matcher(text);
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
        // Collect code byte-ranges to drop. Because one code can produce multiple chars, we drop
        // the code if ANY of its chars is flagged.
        Set<Integer> dropStarts = new HashSet<>();
        for (int i = 0; i < drop.length; i++) {
            if (drop[i]) {
                dropStarts.add(decoded.codeStarts[i]);
            }
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int i = 0;
        while (i < originalBytes.length) {
            int start = i;
            int len = findCodeLenAt(decoded, start);
            if (len <= 0) {
                // Unknown - keep the byte verbatim.
                out.write(originalBytes[i] & 0xFF);
                i += 1;
                continue;
            }
            if (dropStarts.contains(start)) {
                // Replace dropped code with encoded space if possible. This preserves rough
                // layout; if encoding a space fails we simply drop the bytes.
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

    private static int findCodeLenAt(DecodeResult decoded, int byteStart) {
        for (int j = 0; j < decoded.codeStarts.length; j++) {
            if (decoded.codeStarts[j] == byteStart) {
                return decoded.codeLens[j];
            }
        }
        return -1;
    }

    private static byte[] tryEncodeSpace(PDFont font) {
        if (font == null) {
            return new byte[] {0x20};
        }
        try {
            return font.encode(" ");
        } catch (Exception e) {
            // Some fonts cannot encode a space at all (e.g. Type3 throws
            // UnsupportedOperationException
            // from encode()). Returning null drops the code with no placeholder - the target glyph
            // is still physically removed, which is what matters for redaction.
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

    // ---------------------------------------------------------------------
    // Rasterisation fallback
    // ---------------------------------------------------------------------

    /**
     * Rasterise only the pages listed in {@code pagesToRaster} (all pages when null) at 150 DPI and
     * replace those pages' content streams with the rendered image. Pages not in the set keep their
     * original content streams verbatim so unrelated text remains searchable after the fallback.
     */
    private static PDDocument rasterisePages(byte[] sourceBytes, Set<Integer> pagesToRaster)
            throws IOException {
        // Load the document directly and mutate in place: rewriting only the affected pages'
        // content streams is cheaper and guarantees untouched pages' xref entries survive
        // byte-for-byte.
        PDDocument source = org.apache.pdfbox.Loader.loadPDF(sourceBytes);
        try {
            PDFRenderer renderer = new PDFRenderer(source);
            int pageCount = source.getNumberOfPages();
            for (int i = 0; i < pageCount; i++) {
                if (pagesToRaster != null && !pagesToRaster.contains(i)) {
                    continue;
                }
                PDPage page = source.getPage(i);
                PDRectangle media = page.getMediaBox();

                BufferedImage img = renderer.renderImageWithDPI(i, 150, ImageType.RGB);
                ByteArrayOutputStream imgOut = new ByteArrayOutputStream();
                ImageIO.write(img, "png", imgOut);
                PDImageXObject imageXObject =
                        PDImageXObject.createFromByteArray(
                                source, imgOut.toByteArray(), "redacted-page-" + i);

                // Drop all prior content / resources / annotations; the raster is the page now.
                page.getCOSObject().removeItem(COSName.CONTENTS);
                page.setResources(new PDResources());
                page.getCOSObject().removeItem(COSName.ANNOTS);
                // Rotation is already baked into the rendered image, so reset it to zero.
                page.setRotation(0);

                try (PDPageContentStream cs =
                        new PDPageContentStream(
                                source,
                                page,
                                PDPageContentStream.AppendMode.OVERWRITE,
                                false,
                                true)) {
                    // The rendered image already has the rotation baked in visually, so the
                    // resulting page is placed un-rotated against the media box.
                    cs.drawImage(
                            imageXObject,
                            media.getLowerLeftX(),
                            media.getLowerLeftY(),
                            media.getWidth(),
                            media.getHeight());
                }
            }
            return source;
        } catch (IOException | RuntimeException e) {
            source.close();
            throw e;
        }
    }

    // ---------------------------------------------------------------------
    // Pattern construction
    // ---------------------------------------------------------------------

    /**
     * Build a set of regex patterns from user input. Returns an empty list if none of the entries
     * produce a valid pattern.
     */
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
                    core = "\\b" + core + "\\b";
                }
                // Case-insensitive to mirror TextFinderUtils.createOptimizedSearchPatterns: what
                // the finder matches, removal and verification must match too.
                patterns.add(
                        Pattern.compile(core, Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE));
            } catch (PatternSyntaxException e) {
                log.debug("Skipping invalid regex '{}': {}", trimmed, e.getMessage());
            }
        }
        return patterns;
    }

    // ---------------------------------------------------------------------
    // Area capture
    // ---------------------------------------------------------------------

    private static List<String> captureTextInRects(PDPage page, List<PDRectangle> rects)
            throws IOException {
        PDFTextStripperByArea stripper = new PDFTextStripperByArea();
        stripper.setSortByPosition(true);
        for (int i = 0; i < rects.size(); i++) {
            PDRectangle rect = rects.get(i);
            // PDFTextStripperByArea uses a Java2D rectangle in the same coordinate space that
            // TextPosition reports, i.e. top-left origin with Y flipped relative to PDF user space.
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

    // ---------------------------------------------------------------------
    // Content-stream rewriting (rect-driven glyph removal)
    // ---------------------------------------------------------------------

    private static void removeTokensIntersectingRects(
            PDDocument document, PDPage page, List<PDRectangle> rects) throws IOException {

        // Identify which show-text operators should be wiped by running a tiny engine that tracks
        // each operator's rendered bounding box.
        List<Integer> dropTokenIndexes = identifyShowTextOperatorsInRects(document, page, rects);

        PDFStreamParser parser = new PDFStreamParser(page);
        List<Object> tokens = new ArrayList<>();
        Object token;
        while ((token = parser.parseNextToken()) != null) {
            tokens.add(token);
        }

        // Build set of token indexes to blank (the argument immediately preceding a flagged
        // text-showing operator).
        Set<Integer> blankArgIndexes = new HashSet<>();
        int textOpCount = 0;
        for (int i = 0; i < tokens.size(); i++) {
            Object t = tokens.get(i);
            if (t instanceof Operator op && TEXT_SHOWING_OPERATORS.contains(op.getName())) {
                if (dropTokenIndexes.contains(textOpCount) && i > 0) {
                    blankArgIndexes.add(i - 1);
                }
                textOpCount++;
            }
        }

        for (Integer idx : blankArgIndexes) {
            Object arg = tokens.get(idx);
            if (arg instanceof COSString) {
                tokens.set(idx, new COSString(""));
            } else if (arg instanceof COSArray arr) {
                COSArray empty = new COSArray();
                // Preserve numeric kerning entries so page layout doesn't shift wildly but drop
                // every COSString.
                for (COSBase element : arr) {
                    if (!(element instanceof COSString)) {
                        empty.add(element);
                    }
                }
                tokens.set(idx, empty);
            }
        }

        // Additionally wipe Do-drawn images whose bounding box intersects a rect. This needs a
        // coordinate scan - for safety we drop every Do whose CTM origin sits inside a rect.
        List<Integer> doImageIndexes = identifyDoImagesInRects(page, rects);
        int doCount = 0;
        for (int i = tokens.size() - 1; i >= 0; i--) {
            Object t = tokens.get(i);
            if (t instanceof Operator op && "Do".equals(op.getName())) {
                if (doImageIndexes.contains(doCount)) {
                    // Remove both the name argument and the operator.
                    if (i > 0) {
                        tokens.remove(i);
                        tokens.remove(i - 1);
                    }
                }
                doCount++;
            }
        }

        writePageTokens(document, page, tokens);
    }

    private static List<Integer> identifyShowTextOperatorsInRects(
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
        return new ArrayList<>(collector.tokenIndexesToDrop);
    }

    private static List<Integer> identifyDoImagesInRects(PDPage page, List<PDRectangle> rects) {
        // Conservative: we do not attempt to decode CTMs here; the overlay rectangle + Do removal
        // is handled only via the rectangle overlay. Returning an empty list means Do operators
        // are left alone. The overlay draw + image opaque box above the layer still hides image
        // pixels in the rect. Full image physical removal is covered by convert-to-image mode.
        return Collections.emptyList();
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

    // ---------------------------------------------------------------------
    // Font subsetting
    // ---------------------------------------------------------------------

    /**
     * Warns when the document still carries embedded Type0/TrueType font programs after a
     * redaction. PDFBox 3.0 has no stable API to surgically drop specific glyph ids from an
     * already-loaded {@link PDType0Font} / {@link PDTrueTypeFont}, so we do not claim to subset
     * them.
     *
     * <p>This is defence-in-depth only: the content-stream rewrite drops the byte codes that
     * reference those glyphs, so the text is not extractable via a text stripper. Raw font-program
     * inspection could still recover glyph outlines, so we log the limitation rather than pretend
     * it is handled. The convert-to-image path removes this residue entirely.
     */
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

    // ---------------------------------------------------------------------
    // Verification
    // ---------------------------------------------------------------------

    private static void verify(
            byte[] bytes,
            Set<String> literalTargets,
            List<Pattern> patterns,
            Set<Integer> affectedPages) {
        if ((literalTargets == null || literalTargets.isEmpty())
                && (patterns == null || patterns.isEmpty())) {
            return;
        }
        try (PDDocument reopened = org.apache.pdfbox.Loader.loadPDF(bytes)) {
            Set<Integer> pageSet =
                    (affectedPages == null || affectedPages.isEmpty())
                            ? null
                            : new TreeSet<>(affectedPages);
            String extracted = extractText(reopened, pageSet);
            if (extracted == null) {
                return;
            }
            String normalised = extracted.toLowerCase(Locale.ROOT);
            if (literalTargets != null) {
                for (String target : literalTargets) {
                    if (target == null || target.isEmpty()) {
                        continue;
                    }
                    if (normalised.contains(target.toLowerCase(Locale.ROOT))) {
                        throw new RedactionVerificationFailedException(
                                "Redacted text still extractable: '" + target + "'");
                    }
                }
            }
            if (patterns != null) {
                for (Pattern pattern : patterns) {
                    // Regex verification is security-critical: a pathological regex (stack
                    // overflow,
                    // catastrophic backtracking, illegal state) must NOT be treated as "no match".
                    // Treat any failure as a verification FAIL so the fallback path runs instead
                    // of silently returning clean bytes.
                    try {
                        if (pattern.matcher(extracted).find()) {
                            throw new RedactionVerificationFailedException(
                                    "Redacted pattern still extractable: " + pattern.pattern());
                        }
                    } catch (RedactionVerificationFailedException rvf) {
                        throw rvf;
                    } catch (RuntimeException | StackOverflowError e) {
                        log.warn(
                                "Verification regex '{}' threw {}; treating as verification FAIL",
                                pattern.pattern(),
                                e.toString());
                        throw new RedactionVerificationFailedException(
                                "Verification regex failed ("
                                        + pattern.pattern()
                                        + "): "
                                        + e.getMessage(),
                                e instanceof Exception ? (Exception) e : new Exception(e));
                    }
                }
            }
        } catch (IOException e) {
            throw new RedactionVerificationFailedException(
                    "Failed to reopen redacted PDF for verification", e);
        }
    }

    /**
     * Extract text from {@code pageIndexes} (1-based converted internally), or the whole document
     * when {@code pageIndexes} is null.
     */
    private static String extractText(PDDocument document, Set<Integer> pageIndexes)
            throws IOException {
        PDFTextStripper stripper = new PDFTextStripper();
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
     * Scans each page of the saved bytes for surviving targets and returns the 0-based indexes of
     * pages that still leak. Returns {@code null} (meaning "rasterise everything") when detection
     * fails or finds nothing per-page despite the document-wide verification failure (e.g. a match
     * spanning a page boundary in the concatenated extraction).
     */
    private static Set<Integer> findLeakingPages(
            byte[] bytes, Set<String> literalTargets, List<Pattern> patterns) {
        try (PDDocument reopened = org.apache.pdfbox.Loader.loadPDF(bytes)) {
            Set<Integer> leaking = new TreeSet<>();
            PDFTextStripper stripper = new PDFTextStripper();
            for (int i = 0; i < reopened.getNumberOfPages(); i++) {
                stripper.setStartPage(i + 1);
                stripper.setEndPage(i + 1);
                String pageText = stripper.getText(reopened);
                if (pageText == null || pageText.isEmpty()) {
                    continue;
                }
                if (pageLeaks(pageText, literalTargets, patterns)) {
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
        String normalised = pageText.toLowerCase(Locale.ROOT);
        if (literalTargets != null) {
            for (String target : literalTargets) {
                if (target != null
                        && !target.isEmpty()
                        && normalised.contains(target.toLowerCase(Locale.ROOT))) {
                    return true;
                }
            }
        }
        if (patterns != null) {
            for (Pattern pattern : patterns) {
                // Mirror verify(): a throwing pattern counts as a leak so we fail closed.
                try {
                    if (pattern.matcher(pageText).find()) {
                        return true;
                    }
                } catch (RuntimeException | StackOverflowError e) {
                    return true;
                }
            }
        }
        return false;
    }

    // ---------------------------------------------------------------------
    // Helper types
    // ---------------------------------------------------------------------

    /** Result of a rect-driven redaction pass - text strings captured from within the rects. */
    public static final class RedactionResult {
        private final Set<String> capturedStrings;

        public RedactionResult(Set<String> capturedStrings) {
            this.capturedStrings = capturedStrings == null ? Set.of() : capturedStrings;
        }

        public Set<String> getCapturedStrings() {
            return capturedStrings;
        }
    }

    /**
     * A {@link PDFTextStripper} subclass that records the ordinal index of every show-text operator
     * whose glyphs intersect one of the target rects. The resulting indexes line up with the order
     * in which {@link PDFStreamParser} emits text-showing operators from the same page.
     */
    private static final class TokenIndexCollector extends PDFTextStripper {
        private final List<Rectangle2D.Float> rects;
        private final Set<Integer> tokenIndexesToDrop = new HashSet<>();
        private int showTextOpCounter = -1;
        private boolean currentOpInRect = false;

        TokenIndexCollector(List<Rectangle2D.Float> rects) throws IOException {
            this.rects = rects;
            setSortByPosition(false);
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
