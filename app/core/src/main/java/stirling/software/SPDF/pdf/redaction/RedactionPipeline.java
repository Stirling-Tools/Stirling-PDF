package stirling.software.SPDF.pdf.redaction;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.utils.text.TextFinderUtils;
import stirling.software.common.util.RegexPatternUtils;

/**
 * Public facade for the manual-area, whole-page and auto-word redaction paths. Orchestrates the
 * collaborators that do the work: {@link RedactionContentEditor} (content-stream glyph removal),
 * {@link RedactionVerifier} (fail-closed independent verification) and {@link RedactionRasteriser}
 * (last-resort rasterisation), with {@link CatalogScrubber} for out-of-page carriers.
 */
@Slf4j
public final class RedactionPipeline {

    public static final Set<String> TEXT_SHOWING_OPERATORS = Set.of("Tj", "TJ", "'", "\"");

    private RedactionPipeline() {}

    /** Test hook to simulate the native binding being unavailable (drives the fail-closed path). */
    static void setJpdfiumAvailableForTest(boolean available) {
        RedactionVerifier.setJpdfiumAvailableForTest(available);
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
            capturedStrings.addAll(RedactionContentEditor.captureTextInRects(page, rects));

            // Rotation / non-zero CropBox origin break the coordinate flip, and text-bearing forms
            // or in-rect images defeat page-stream ordinal removal.
            boolean surgical =
                    RedactionContentEditor.isSurgicallySafe(page)
                            && RedactionContentEditor.removeTokensIntersectingRects(
                                    document, page, rects);
            if (!surgical) {
                forceRasterPages.add(pageIndex);
            }
            RedactionContentEditor.removeOverlappingAnnotations(page, rects);
            RedactionContentEditor.drawOverlay(document, page, rects, overlayColor);
        }

        return new RedactionResult(capturedStrings, forceRasterPages);
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
        List<Pattern> effectivePatterns =
                RedactionContentEditor.effectivePatterns(literalTargets, patterns);
        if (effectivePatterns.isEmpty()) {
            return;
        }
        int pageIndex = 0;
        for (PDPage page : document.getPages()) {
            try {
                RedactionContentEditor.rewritePageContent(document, page, effectivePatterns);
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
        RedactionVerifier.warnAboutEmbeddedFontGlyphs(document);

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        byte[] bytes = baos.toByteArray();

        try {
            RedactionVerifier.verify(bytes, literalTargets, patterns, affectedPages);
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
                            ? RedactionVerifier.findLeakingPages(bytes, literalTargets, patterns)
                            : new HashSet<>(affectedPages);
            try (PDDocument rasterised = RedactionRasteriser.rasterisePages(bytes, pagesToRaster)) {
                CatalogScrubber.scrub(rasterised, literalTargets, patterns);
                ByteArrayOutputStream rasterOut = new ByteArrayOutputStream();
                rasterised.save(rasterOut);
                byte[] rasterBytes = rasterOut.toByteArray();
                RedactionVerifier.verify(rasterBytes, literalTargets, patterns, affectedPages);
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
        RedactionVerifier.warnAboutEmbeddedFontGlyphs(document);

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        byte[] bytes = baos.toByteArray();

        Set<Integer> toRaster =
                new HashSet<>(forceRasterPages == null ? Set.of() : forceRasterPages);
        toRaster.addAll(RedactionVerifier.findLeakingRectPages(bytes, rectsByPage));
        if (toRaster.isEmpty()) {
            return bytes;
        }
        log.warn("Manual redaction rasterising page(s) {} to guarantee removal", toRaster);
        try (PDDocument rasterised = RedactionRasteriser.rasterisePages(bytes, toRaster)) {
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
        try (PDDocument rasterised =
                RedactionRasteriser.rasterisePages(bytes, new HashSet<>(pages))) {
            CatalogScrubber.scrub(rasterised, literalTargets, patterns);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            rasterised.save(out);
            return out.toByteArray();
        }
    }

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
                // Compile via the shared cache (same path as the finder) for consistent
                // handling of user-supplied regex; ReDoS is bounded by DeadlineCharSequence.
                patterns.add(RegexPatternUtils.getInstance().createSearchPattern(core, true));
            } catch (PatternSyntaxException e) {
                log.debug("Skipping invalid regex '{}': {}", trimmed, e.getMessage());
            }
        }
        return patterns;
    }

    /**
     * True if any font is not provably reliable for PDFBox glyph extraction (delegates to {@link
     * RedactionVerifier}); exposed here for the pipeline's callers and tests.
     */
    static boolean documentHasUnreliableFont(PDDocument document) {
        return RedactionVerifier.documentHasUnreliableFont(document);
    }

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
}
