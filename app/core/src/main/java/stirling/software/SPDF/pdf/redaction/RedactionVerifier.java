package stirling.software.SPDF.pdf.redaction;

import java.io.IOException;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDTrueTypeFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.text.PDFTextStripper;

import lombok.extern.slf4j.Slf4j;

import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.text.PdfTextExtractor;

/**
 * Independent, fail-closed verification that redacted text is truly gone from the OUTPUT document:
 * an /ActualText-blind PDFBox pass plus an additive native (PDFium) pass for fonts PDFBox cannot
 * reliably extract. Failure messages carry a target index, never the target text.
 */
@Slf4j
public final class RedactionVerifier {

    private static final int MAX_XOBJECT_DEPTH = 10;

    private static final Pattern WHITESPACE_RUN = Pattern.compile("\\s+");
    private static final Pattern BREAK_HYPHEN = Pattern.compile("-\\s+");
    private static final String SOFT_HYPHEN = String.valueOf((char) 0x00AD);

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
    public static void warnAboutEmbeddedFontGlyphs(PDDocument document) {
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
                if ((font instanceof PDType0Font || font instanceof PDTrueTypeFont)
                        && font.isEmbedded()) {
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

    /**
     * Fail-closed check that no literal target or pattern is still extractable from {@code bytes}.
     * Throws {@link RedactionVerificationFailedException} (mapped to HTTP 422) on any survivor.
     */
    public static void verify(byte[] bytes, Set<String> literalTargets, List<Pattern> patterns) {
        if ((literalTargets == null || literalTargets.isEmpty())
                && (patterns == null || patterns.isEmpty())) {
            return;
        }
        try (DeadlineCharSequence.BudgetScope scope = DeadlineCharSequence.armSharedBudget()) {
            // PDFBox pass, blind to /ActualText so a benign override can't mask real glyphs.
            boolean needNativePass;
            try (PDDocument reopened = Loader.loadPDF(bytes)) {
                assertNoTarget(extractText(reopened), literalTargets, patterns);
                needNativePass = documentHasUnreliableFont(reopened);
            } catch (IOException e) {
                throw new RedactionVerificationFailedException(
                        "Failed to reopen redacted PDF for verification", e);
            }
            // Additive producer-independent pass: native PDFium sees glyphs PDFBox may miss
            // (fonts with no ToUnicode).
            if (needNativePass) {
                String nativeText = extractTextJPDFium(bytes);
                if (nativeText == null) {
                    // Required independent pass could not run (native unavailable, unreadable
                    // page, or doc over the size guard); fail closed.
                    throw new RedactionVerificationFailedException(
                            "Independent native verification could not run for a document whose "
                                    + "fonts PDFBox cannot reliably extract; cannot confirm "
                                    + "removal");
                }
                assertNoTarget(nativeText, literalTargets, patterns);
            }
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

    /**
     * Fail-closed match check with whitespace-normalised literals and X2 regex semantics. Messages
     * identify the target by ordinal only: the target IS the secret the caller is removing, so it
     * must never reach a log line or an error response body.
     */
    private static void assertNoTarget(
            String extracted, Set<String> literalTargets, List<Pattern> patterns) {
        if (extracted == null) {
            return;
        }
        String normalised =
                WHITESPACE_RUN.matcher(extracted.toLowerCase(Locale.ROOT)).replaceAll(" ");
        // De-hyphenated view catches a target split by a soft hyphen (U+00AD) or a line-break
        // hyphen ("-" + space).
        String dehyphenated =
                BREAK_HYPHEN.matcher(normalised.replace(SOFT_HYPHEN, "")).replaceAll("");
        if (literalTargets != null) {
            int index = 0;
            for (String target : literalTargets) {
                index++;
                if (target == null || target.isEmpty()) {
                    continue;
                }
                String needle =
                        WHITESPACE_RUN.matcher(target.toLowerCase(Locale.ROOT)).replaceAll(" ");
                if (normalised.contains(needle) || dehyphenated.contains(needle)) {
                    throw new RedactionVerificationFailedException(
                            "Redacted text still extractable (target #" + index + ")");
                }
            }
        }
        if (patterns != null) {
            int index = 0;
            for (Pattern pattern : patterns) {
                index++;
                try {
                    if (pattern.matcher(DeadlineCharSequence.of(extracted)).find()) {
                        throw new RedactionVerificationFailedException(
                                "Redacted pattern still extractable (pattern #" + index + ")");
                    }
                } catch (RedactionVerificationFailedException rvf) {
                    throw rvf;
                } catch (RuntimeException | StackOverflowError e) {
                    throw new RedactionVerificationFailedException(
                            "Verification regex failed (pattern #" + index + ")",
                            e instanceof Exception ? (Exception) e : new Exception(e));
                }
            }
        }
    }

    /** Extract all text using an /ActualText-blind stripper. */
    private static String extractText(PDDocument document) throws IOException {
        return new GlyphOnlyTextStripper().getText(document);
    }

    /**
     * Independent native (PDFium) extraction; null if the binding is unavailable (additive only).
     */
    private static String extractTextJPDFium(byte[] bytes) {
        if (!jpdfiumAvailable || bytes.length > MAX_JPDFIUM_VERIFY_BYTES) {
            return null;
        }
        try (PdfDocument doc = PdfDocument.open(bytes)) {
            StringBuilder sb = new StringBuilder();
            int n = doc.pageCount();
            for (int i = 0; i < n; i++) {
                String pageText = jpdfiumPlainText(doc, i);
                if (pageText == null) {
                    return null; // one unreadable page = the whole pass proves nothing
                }
                sb.append(pageText).append('\n');
            }
            return sb.toString();
        } catch (RuntimeException | Error e) {
            onJpdfiumFailure(e);
            return null;
        }
    }

    /** Plain text of one page; null (NOT empty) when the page can't be read, to fail closed. */
    private static String jpdfiumPlainText(PdfDocument doc, int i) {
        try {
            return PdfTextExtractor.extractPage(doc, i).plainText();
        } catch (RuntimeException | Error e) {
            log.debug("JPDFium could not extract page {}: {}", i + 1, e.toString());
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
