package stirling.software.SPDF.pdf.redaction;

import java.awt.geom.Rectangle2D;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDTrueTypeFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.text.PDFTextStripper;

import lombok.extern.slf4j.Slf4j;

import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.text.PdfTextExtractor;

/**
 * Independent, fail-closed verification that redacted text is truly gone: an /ActualText-blind
 * PDFBox pass plus an additive native (PDFium) pass for fonts PDFBox cannot reliably extract, with
 * per-page leak localisation for the rasterisation fallback.
 */
@Slf4j
final class RedactionVerifier {

    private static final int MAX_XOBJECT_DEPTH = 10;

    // Latched false when the native PDFium binding can't load, so the host falls back to the PDFBox
    // pass.
    private static volatile boolean jpdfiumAvailable = true;

    // Skip the additive native pass above this size to bound off-heap copy + native runtime on
    // adversarial inputs; the PDFBox glyph-blind pass still verifies.
    private static final long MAX_JPDFIUM_VERIFY_BYTES = 100L * 1024 * 1024;

    private RedactionVerifier() {}

    /** Test hook to simulate the native binding being unavailable (drives the fail-closed path). */
    static void setJpdfiumAvailableForTest(boolean available) {
        jpdfiumAvailable = available;
    }

    /** Warns when the document still carries embedded Type0/TrueType font */
    static void warnAboutEmbeddedFontGlyphs(PDDocument document) {
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

    static void verify(
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
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
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
        try (PdfDocument doc = PdfDocument.open(bytes)) {
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

    private static String jpdfiumPlainText(PdfDocument doc, int i) {
        try {
            return PdfTextExtractor.extractPage(doc, i).plainText();
        } catch (RuntimeException | Error e) {
            return "";
        }
    }

    /** One native open, all pages' plain text; null if the binding is unavailable. */
    private static List<String> extractPagesJPDFium(byte[] bytes) {
        if (!jpdfiumAvailable || bytes.length > MAX_JPDFIUM_VERIFY_BYTES) {
            return null;
        }
        try (PdfDocument doc = PdfDocument.open(bytes)) {
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
    static Set<Integer> findLeakingPages(
            byte[] bytes, Set<String> literalTargets, List<Pattern> patterns) {
        List<String> jpdfiumPages = extractPagesJPDFium(bytes);
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
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

    /** Redacted pages that still show text inside a rect or carry an overlapping annotation. */
    static Set<Integer> findLeakingRectPages(
            byte[] bytes, Map<Integer, List<PDRectangle>> rectsByPage) {
        Set<Integer> leaking = new HashSet<>();
        if (rectsByPage == null || rectsByPage.isEmpty()) {
            return leaking;
        }
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            for (Map.Entry<Integer, List<PDRectangle>> entry : rectsByPage.entrySet()) {
                int pageIndex = entry.getKey();
                if (pageIndex < 0 || pageIndex >= reopened.getNumberOfPages()) {
                    continue;
                }
                PDPage page = reopened.getPage(pageIndex);
                if (glyphStillInRects(reopened, page, pageIndex, entry.getValue())
                        || annotationOverlapsRect(page, entry.getValue())) {
                    leaking.add(pageIndex);
                }
            }
        } catch (IOException e) {
            // Cannot verify - rasterise every redacted page to be safe.
            return new HashSet<>(rectsByPage.keySet());
        }
        return leaking;
    }

    /**
     * True if any non-blank glyph is still painted inside a rect. Position-based (not ToUnicode),
     * so it catches residual CID/Type3/no-ToUnicode glyphs the text stripper would miss; fails
     * closed.
     */
    private static boolean glyphStillInRects(
            PDDocument doc, PDPage page, int pageIndex, List<PDRectangle> rects) {
        try {
            List<Rectangle2D.Float> areaRects = new ArrayList<>();
            for (PDRectangle rect : rects) {
                float pdfY = page.getBBox().getHeight() - rect.getUpperRightY();
                areaRects.add(
                        new Rectangle2D.Float(
                                rect.getLowerLeftX(), pdfY, rect.getWidth(), rect.getHeight()));
            }
            TokenIndexCollector collector = new TokenIndexCollector(areaRects);
            collector.setStartPage(pageIndex + 1);
            collector.setEndPage(pageIndex + 1);
            collector.getText(doc);
            return collector.anyGlyphInRect();
        } catch (Exception e) {
            return true; // cannot prove the rect is clean - rasterise to be safe
        }
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
}
