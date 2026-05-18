package stirling.software.SPDF.controller.api.security;

import java.awt.Color;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.PDFText;
import stirling.software.SPDF.model.api.security.RedactExecuteRequest;
import stirling.software.SPDF.model.api.security.RedactImageBox;
import stirling.software.SPDF.model.api.security.RedactTextRange;
import stirling.software.SPDF.pdf.parser.PageColumnLayout;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.TempFile;

@Service
@Slf4j
@RequiredArgsConstructor
class RedactExecuteService {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final ManualRedactionService manualRedactionService;
    private final TextRedactionService textRedactionService;

    TempFile execute(RedactExecuteRequest request) throws IOException {
        String[] exactTerms = cleanStrings(request.getTextsToRedact());
        String[] regexTerms = cleanStrings(request.getRegexPatterns());
        List<Integer> pageIndices = toZeroBasedIndices(request.getPageNumbers());
        List<Integer> imagePageIndices = toZeroBasedIndices(request.getImagePages());
        List<RedactTextRange> textRanges =
                request.getTextRanges() != null ? request.getTextRanges() : List.of();
        List<RedactImageBox> imageBoxes =
                request.getImageBoxes() != null ? request.getImageBoxes() : List.of();
        boolean hasRedactAllImages = request.isRedactAllImages();

        boolean hasTexts = exactTerms.length > 0;
        boolean hasRegex = regexTerms.length > 0;
        boolean hasPages = !pageIndices.isEmpty();
        boolean hasImageBoxes = !imageBoxes.isEmpty();
        boolean hasTextRanges = !textRanges.isEmpty();

        if (!hasTexts
                && !hasRegex
                && !hasPages
                && !hasImageBoxes
                && !hasTextRanges
                && !hasRedactAllImages) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.redaction.no.targets", "No redaction targets provided");
        }

        boolean overlayOnly =
                RedactExecuteRequest.RedactionStrategy.OVERLAY_ONLY.equals(request.getStrategy());
        boolean imageFinalize =
                RedactExecuteRequest.RedactionStrategy.IMAGE_FINALIZE.equals(request.getStrategy());
        boolean convertToImage = imageFinalize || request.isConvertPDFToImage();

        log.info(
                "[redact/execute] strategy={} exactTerms={} regexTerms={} hasPages={} imageFinalize={}",
                request.getStrategy(),
                exactTerms.length,
                regexTerms.length,
                hasPages,
                convertToImage);

        PDDocument document = null;
        try {
            if (request.getFileInput() == null) {
                throw ExceptionUtils.createFileNullOrEmptyException();
            }
            document = pdfDocumentFactory.load(request.getFileInput());

            // --- Collect all text matches ---
            Map<Integer, List<PDFText>> foundTexts = new HashMap<>();
            if (exactTerms.length > 0) {
                textRedactionService
                        .findTextToRedact(document, exactTerms, false, false)
                        .forEach(
                                (page, hits) ->
                                        foundTexts
                                                .computeIfAbsent(page, k -> new ArrayList<>())
                                                .addAll(hits));
            }
            if (regexTerms.length > 0) {
                textRedactionService
                        .findTextToRedact(document, regexTerms, true, false)
                        .forEach(
                                (page, hits) ->
                                        foundTexts
                                                .computeIfAbsent(page, k -> new ArrayList<>())
                                                .addAll(hits));
            }

            int totalMatches = foundTexts.values().stream().mapToInt(List::size).sum();
            log.info(
                    "[redact/execute] scan complete: {} text matches across {} pages",
                    totalMatches,
                    foundTexts.size());

            // --- Text removal (content-stream rewriting) ---
            boolean needsOverlayOnly = overlayOnly;
            if (!foundTexts.isEmpty() && !overlayOnly) {
                try {
                    boolean fallback = false;
                    if (exactTerms.length > 0) {
                        Map<Integer, List<PDFText>> exactFound =
                                textRedactionService.findTextToRedact(
                                        document, exactTerms, false, false);
                        if (!exactFound.isEmpty()) {
                            fallback =
                                    textRedactionService.performTextReplacement(
                                            document, exactFound, exactTerms, false, false);
                        }
                    }
                    if (!fallback && regexTerms.length > 0) {
                        Map<Integer, List<PDFText>> regexFound =
                                textRedactionService.findTextToRedact(
                                        document, regexTerms, true, false);
                        if (!regexFound.isEmpty()) {
                            fallback |=
                                    textRedactionService.performTextReplacement(
                                            document, regexFound, regexTerms, true, false);
                        }
                    }
                    needsOverlayOnly = fallback;
                    if (fallback) {
                        log.warn(
                                "[redact/execute] font compatibility issue — falling back to overlay-only");
                    } else {
                        log.info(
                                "[redact/execute] content-stream text removal applied successfully");
                    }
                } catch (Exception e) {
                    log.warn(
                            "[redact/execute] text removal failed, falling back to overlay: {}",
                            e.getMessage());
                    needsOverlayOnly = true;
                }
            } else if (overlayOnly) {
                log.info(
                        "[redact/execute] overlay-only mode requested — skipping content-stream rewriting");
            }

            // Reload fresh document on fallback so we overlay onto clean content
            if (needsOverlayOnly && !foundTexts.isEmpty()) {
                log.info("[redact/execute] reloading document for clean overlay pass");
                document.close();
                document = pdfDocumentFactory.load(request.getFileInput());
                foundTexts.clear();
                if (exactTerms.length > 0) {
                    textRedactionService
                            .findTextToRedact(document, exactTerms, false, false)
                            .forEach(
                                    (page, hits) ->
                                            foundTexts
                                                    .computeIfAbsent(page, k -> new ArrayList<>())
                                                    .addAll(hits));
                }
                if (regexTerms.length > 0) {
                    textRedactionService
                            .findTextToRedact(document, regexTerms, true, false)
                            .forEach(
                                    (page, hits) ->
                                            foundTexts
                                                    .computeIfAbsent(page, k -> new ArrayList<>())
                                                    .addAll(hits));
                }
            }

            // --- Full-page wipes with individual element boxes ---
            if (hasPages) {
                PDPageTree allPages = document.getDocumentCatalog().getPages();
                Color pageColor = ManualRedactionService.decodeOrDefault(request.getRedactColor());
                Collections.sort(pageIndices);
                log.info(
                        "[redact/execute] full-page wipe: {} pages ({})",
                        pageIndices.size(),
                        pageIndices);

                Map<Integer, List<float[]>> pageElementBoxes = new HashMap<>();
                for (Integer idx : pageIndices) {
                    if (idx >= 0 && idx < allPages.getCount()) {
                        try {
                            pageElementBoxes.put(
                                    idx,
                                    manualRedactionService.extractPageElementBoxes(
                                            document, allPages.get(idx), idx));
                        } catch (Exception e) {
                            log.warn(
                                    "[redact/execute] element extraction failed for page {}: {}",
                                    idx,
                                    e.getMessage());
                        }
                    }
                }

                for (Integer idx : pageIndices) {
                    if (idx >= 0 && idx < allPages.getCount()) {
                        PDPage page = allPages.get(idx);
                        List<float[]> elementBoxes =
                                pageElementBoxes.getOrDefault(idx, Collections.emptyList());
                        page.getCOSObject().removeItem(COSName.CONTENTS);
                        page.setResources(new PDResources());
                        try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                            cs.setNonStrokingColor(pageColor);
                            if (elementBoxes.isEmpty()) {
                                PDRectangle box = page.getBBox();
                                cs.addRect(0, 0, box.getWidth(), box.getHeight());
                            } else {
                                log.info(
                                        "[redact/execute] page {}: drawing {} element boxes",
                                        idx + 1,
                                        elementBoxes.size());
                                for (float[] r : elementBoxes) {
                                    cs.addRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
                                }
                            }
                            cs.fill();
                        }
                    }
                }
            }

            // --- Text-range redaction (section start → end, inclusive, across pages) ---
            if (hasTextRanges) {
                log.info("[redact/execute] {} text ranges to redact", textRanges.size());
                Map<Integer, PageColumnLayout> layoutCache = new HashMap<>();
                for (RedactTextRange range : textRanges) {
                    String rangeStart = trimOrEmpty(range.getStartString());
                    String rangeEnd = trimOrEmpty(range.getEndString());
                    try {
                        List<PDFText> blocks =
                                collectRangeBlocks(document, rangeStart, rangeEnd, layoutCache);
                        if (!blocks.isEmpty()) {
                            manualRedactionService.redactFoundText(
                                    document,
                                    blocks,
                                    request.getCustomPadding(),
                                    ManualRedactionService.decodeOrDefault(
                                            request.getRedactColor()),
                                    false);
                        } else {
                            log.warn(
                                    "[redact/execute] range not found: start='{}' end='{}'",
                                    rangeStart,
                                    rangeEnd);
                        }
                    } catch (Exception e) {
                        log.warn("[redact/execute] range redaction failed: {}", e.getMessage());
                    }
                }
            }

            // --- Image box overlays (targeted image redaction from AI analysis) ---
            if (hasImageBoxes) {
                List<float[]> parsedImageBoxes = toFloatArrays(imageBoxes);
                log.info("[redact/execute] {} image box overlays", parsedImageBoxes.size());
                if (!parsedImageBoxes.isEmpty()) {
                    Color boxColor =
                            ManualRedactionService.decodeOrDefault(request.getRedactColor());
                    manualRedactionService.redactImageBoxes(document, parsedImageBoxes, boxColor);
                }
            }

            // --- Auto image detection (redact all images on specified pages) ---
            if (hasRedactAllImages) {
                PDPageTree allPages = document.getDocumentCatalog().getPages();
                Color imgColor = ManualRedactionService.decodeOrDefault(request.getRedactColor());

                if (imagePageIndices.isEmpty()) {
                    imagePageIndices = new ArrayList<>();
                    for (int i = 0; i < allPages.getCount(); i++) {
                        imagePageIndices.add(i);
                    }
                }

                List<float[]> detectedBoxes = new ArrayList<>();
                for (int pageIdx : imagePageIndices) {
                    if (pageIdx < 0 || pageIdx >= allPages.getCount()) {
                        continue;
                    }
                    try {
                        PDPage page = allPages.get(pageIdx);
                        PageImageExtractor extractor = new PageImageExtractor(page);
                        extractor.processPage(page);
                        for (float[] box : extractor.getImageBoxes()) {
                            detectedBoxes.add(
                                    new float[] {pageIdx, box[0], box[1], box[2], box[3]});
                        }
                    } catch (Exception e) {
                        log.warn(
                                "[redact/execute] image detection failed for page {}: {}",
                                pageIdx + 1,
                                e.getMessage());
                    }
                }

                log.info(
                        "[redact/execute] auto image detection: {} images across {} pages",
                        detectedBoxes.size(),
                        imagePageIndices.size());

                if (!detectedBoxes.isEmpty()) {
                    manualRedactionService.redactImageBoxes(document, detectedBoxes, imgColor);
                }
            }

            // --- Finalize: overlay text boxes + optional image conversion + save ---
            return manualRedactionService.finalizeRedaction(
                    document,
                    foundTexts,
                    request.getRedactColor(),
                    request.getCustomPadding(),
                    convertToImage,
                    !needsOverlayOnly);

        } catch (Exception e) {
            log.error("Execute redaction failed: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to perform PDF redaction: " + e.getMessage(), e);
        } finally {
            if (document != null) {
                try {
                    document.close();
                } catch (IOException e) {
                    log.warn("Failed to close document: {}", e.getMessage());
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // Range collection helpers
    // -----------------------------------------------------------------------

    /**
     * Locates {@code startStr} in the document and returns {@link PDFText} blocks for every text
     * line and image from that point up to (but NOT including) the line where {@code endStr}
     * begins. If {@code endStr} is blank, redacts from {@code startStr} to the end of the document.
     *
     * <p>Multi-column pages follow reading order: down the start column, jump to the top of the
     * next column, continue to the end anchor. Single-column pages reduce to a plain Y-band check.
     */
    List<PDFText> collectRangeBlocks(
            PDDocument document,
            String startStr,
            String endStr,
            Map<Integer, PageColumnLayout> layoutCache)
            throws IOException {

        PDPageTree allPages = document.getDocumentCatalog().getPages();
        int totalPages = allPages.getCount();

        Map<Integer, List<PDFText>> startMatchesByPage = findWithFallbacks(document, startStr);
        if (startMatchesByPage.isEmpty()) {
            log.warn("[redact/execute] range start not found: '{}'", startStr);
            return Collections.emptyList();
        }

        List<Anchor> starts = toAnchors(document, startMatchesByPage, layoutCache);
        starts.sort(READING_ORDER);
        log.info(
                "[redact/execute] start='{}' matched {} anchor(s): {}",
                startStr,
                starts.size(),
                anchorSummary(starts));

        // An empty/blank end anchor is the caller's explicit way to say "redact to end of
        // document". A non-empty end anchor that we can't locate is a *failure*,
        // so skip the range and warn loudly.
        boolean openEnded = (endStr == null || endStr.isBlank());
        List<Anchor> ends = new ArrayList<>();
        if (!openEnded) {
            Map<Integer, List<PDFText>> endMatchesByPage = findWithFallbacks(document, endStr);
            if (endMatchesByPage.isEmpty()) {
                log.warn(
                        "[redact/execute] range end '{}' not found in document - skipping range"
                                + " (start='{}')",
                        endStr,
                        startStr);
                return Collections.emptyList();
            }
            ends = toAnchors(document, endMatchesByPage, layoutCache);
            ends.sort(READING_ORDER);
            log.info(
                    "[redact/execute] end='{}' matched {} anchor(s): {}",
                    endStr,
                    ends.size(),
                    anchorSummary(ends));
        }

        List<PDFText> blocks = new ArrayList<>();
        for (Anchor start : starts) {
            Anchor end = null;
            int endPage;
            if (openEnded) {
                endPage = totalPages - 1;
            } else {
                for (Anchor candidate : ends) {
                    if (READING_ORDER.compare(candidate, start) > 0) {
                        end = candidate;
                        break;
                    }
                }
                if (end == null) {
                    log.warn(
                            "[redact/execute] no end anchor after start at (page={}, col={}, y={}) — skipping",
                            start.page + 1,
                            start.col,
                            start.y);
                    continue;
                }
                endPage = end.page;
            }

            log.info(
                    "[redact/execute] range pages {}-{}: start='{}' (col {}) end='{}'",
                    start.page + 1,
                    endPage + 1,
                    startStr,
                    start.col,
                    openEnded ? "<end of document>" : endStr);

            collectBlocksForRange(document, allPages, start, end, openEnded, blocks, layoutCache);
        }

        log.info(
                "[redact/execute] range '{}'→'{}': {} total blocks",
                startStr,
                openEnded ? "<end of document>" : endStr,
                blocks.size());
        return blocks;
    }

    /**
     * Collects all redactable content (text line segments and images) between two anchor positions
     * within a single start→end range, appending results into {@code blocks}.
     *
     * <p>Boxes from {@link AllTextLineExtractor} are classified by {@link PageColumnLayout}. A box
     * straddling a gutter (e.g. a full-width header) is emitted only when every column it crosses
     * is in the redact zone.
     */
    private void collectBlocksForRange(
            PDDocument document,
            PDPageTree allPages,
            Anchor start,
            Anchor end,
            boolean openEnded,
            List<PDFText> blocks,
            Map<Integer, PageColumnLayout> layoutCache)
            throws IOException {

        int startPage = start.page;
        int endPage = openEnded ? allPages.getCount() - 1 : end.page;
        int endCol =
                openEnded ? layoutFor(document, endPage, layoutCache).columnCount() - 1 : end.col;
        float startY = start.y;
        float endY = openEnded ? Float.POSITIVE_INFINITY : end.y;

        for (int pageIdx = startPage; pageIdx <= endPage; pageIdx++) {
            PDPage page = allPages.get(pageIdx);
            float pageHeight = page.getBBox().getHeight();
            PageColumnLayout layout = layoutFor(document, pageIdx, layoutCache);

            AllTextLineExtractor textExtractor = new AllTextLineExtractor(pageIdx + 1, pageHeight);
            textExtractor.getText(document);
            // Use the screen-Y boxes directly so comparisons against anchor screen Ys aren't
            // off by a float ulp from the PDF↔screen round-trip.
            for (float[] sb : textExtractor.getScreenLineBoxes()) {
                emitColumnSlices(
                        pageIdx, layout, sb[0], sb[2], sb[1], sb[3], start.col, startPage, startY,
                        endCol, endPage, endY, blocks);
            }

            PageImageExtractor imgExtractor = new PageImageExtractor(page);
            imgExtractor.processPage(page);
            for (float[] ib : imgExtractor.getImageBoxes()) {
                float screenY1 = pageHeight - ib[3];
                float screenY2 = pageHeight - ib[1];
                emitColumnSlices(
                        pageIdx, layout, ib[0], ib[2], screenY1, screenY2, start.col, startPage,
                        startY, endCol, endPage, endY, blocks);
            }
        }
    }

    /** Emits each per-column sub-box accepted by the reading-order predicate. */
    private static void emitColumnSlices(
            int pageIdx,
            PageColumnLayout layout,
            float x1,
            float x2,
            float yTop,
            float yBottom,
            int startCol,
            int startPage,
            float startY,
            int endCol,
            int endPage,
            float endY,
            List<PDFText> blocks) {
        int[] cols = layout.columnsCrossing(x1, x2);
        if (cols.length == 1) {
            // Lives entirely in one column — use that column's predicate.
            if (inColumnZone(
                    pageIdx, cols[0], yTop, yBottom, startPage, startCol, startY, endPage, endCol,
                    endY)) {
                blocks.add(new PDFText(pageIdx, x1, yTop, x2, yBottom, ""));
            }
            return;
        }
        // Spanning box (full-width content like a title, footer, or aligned-baseline cross-column
        // merge): include only when EVERY column the box crosses is in the redact zone. This is
        // conservative — for a cross-column redaction it correctly excludes the page title/footer,
        // and on the rare aligned-baseline merged-line case it under-redacts rather than splitting
        // the box incorrectly.
        for (int col : cols) {
            if (!inColumnZone(
                    pageIdx, col, yTop, yBottom, startPage, startCol, startY, endPage, endCol,
                    endY)) {
                return;
            }
        }
        blocks.add(new PDFText(pageIdx, x1, yTop, x2, yBottom, ""));
    }

    /**
     * Reading-order predicate: true when (col, yBottom) on page {@code pageIdx} sits between the
     * start anchor (inclusive) and end anchor (exclusive). Anchor Ys are glyph tops from {@link
     * PDFText#getY1()}; comparing against line baselines includes the anchor's own row.
     */
    static boolean inColumnZone(
            int pageIdx,
            int col,
            float yTop,
            float yBottom,
            int startPage,
            int startCol,
            float startY,
            int endPage,
            int endCol,
            float endY) {
        if (pageIdx > startPage && pageIdx < endPage) return true;
        if (pageIdx == startPage && pageIdx == endPage) {
            if (startCol == endCol) {
                return col == startCol && yBottom >= startY && yBottom < endY;
            }
            if (startCol < endCol) {
                if (col < startCol || col > endCol) return false;
                if (col == startCol) return yBottom >= startY;
                if (col == endCol) return yBottom < endY;
                return true;
            }
            // start/end out of reading order on the same page — degenerate to single column.
            return col == startCol && yBottom >= startY;
        }
        if (pageIdx == startPage) {
            if (col == startCol) return yBottom >= startY;
            return col > startCol;
        }
        if (pageIdx == endPage) {
            if (col == endCol) return yBottom < endY;
            return col < endCol;
        }
        return false;
    }

    /** Lazily builds and caches the column layout for a single page. */
    private PageColumnLayout layoutFor(
            PDDocument document, int pageIdx, Map<Integer, PageColumnLayout> cache)
            throws IOException {
        PageColumnLayout cached = cache.get(pageIdx);
        if (cached != null) return cached;
        PDPage page = document.getDocumentCatalog().getPages().get(pageIdx);
        float pageWidth = page.getBBox().getWidth();
        float pageHeight = page.getBBox().getHeight();
        AllTextLineExtractor extractor = new AllTextLineExtractor(pageIdx + 1, pageHeight);
        extractor.getText(document);
        // AllTextLineExtractor emits boxes as [x1, pdfYbot, x2, pdfYtop]; PageColumnLayout only
        // looks at indices 0 and 2 (x1, x2), so feed the boxes through as-is.
        PageColumnLayout layout =
                PageColumnLayout.fromLineBoxes(extractor.getLineBoxes(), pageWidth);
        if (layout.columnCount() > 1) {
            float[] g = layout.gutters().get(0);
            log.info(
                    "[redact/execute] page {} layout: 2 cols, gutter x=[{}, {}]",
                    pageIdx + 1,
                    g[0],
                    g[1]);
        } else {
            log.info("[redact/execute] page {} layout: 1 col (single-column mode)", pageIdx + 1);
        }
        cache.put(pageIdx, layout);
        return layout;
    }

    /**
     * Flattens anchor matches into one entry per hit, attaching the column index derived from each
     * hit's X-span. Used so {@link #collectRangeBlocks} can sort anchors in reading order.
     */
    private List<Anchor> toAnchors(
            PDDocument document,
            Map<Integer, List<PDFText>> matchesByPage,
            Map<Integer, PageColumnLayout> layoutCache)
            throws IOException {
        List<Anchor> out = new ArrayList<>();
        for (int page : matchesByPage.keySet().stream().sorted().toList()) {
            PageColumnLayout layout = layoutFor(document, page, layoutCache);
            for (PDFText hit : matchesByPage.get(page)) {
                int col = layout.columnOf(hit.getX1(), hit.getX2());
                // For the anchor's reference Y, use the TOP of the matched glyphs (Y1). For a
                // single-line anchor it falls just above the line's baseline; for a multi-line
                // match it's the top of the FIRST line of the match. The predicate compares each
                // line's baseline against this — a line whose baseline > Y1 is on or below the
                // anchor's first row, which is what "from the anchor inclusive" means.
                out.add(new Anchor(page, col, hit.getY1(), hit));
            }
        }
        return out;
    }

    /** Lexicographic ordering by (page, column, screenY). */
    private static final Comparator<Anchor> READING_ORDER =
            Comparator.comparingInt((Anchor a) -> a.page)
                    .thenComparingInt(a -> a.col)
                    .thenComparingDouble(a -> a.y);

    private static String anchorSummary(List<Anchor> anchors) {
        StringBuilder sb = new StringBuilder();
        int max = Math.min(anchors.size(), 5);
        for (int i = 0; i < max; i++) {
            Anchor a = anchors.get(i);
            if (i > 0) sb.append(", ");
            sb.append(String.format("(p=%d,c=%d,y=%.1f)", a.page + 1, a.col, a.y));
        }
        if (anchors.size() > max) sb.append(", …");
        return sb.toString();
    }

    private record Anchor(int page, int col, float y, PDFText text) {}

    /**
     * Tries progressively more permissive variants: raw (regex then literal), letter-spacing
     * collapsed, then a punctuation-tolerant regex over alphanumeric runs.
     */
    private Map<Integer, List<PDFText>> findWithFallbacks(PDDocument document, String raw) {
        String trimmed = raw.trim();
        String collapsed = collapseLetterSpacing(trimmed);
        String tolerant = punctuationTolerantRegex(trimmed);

        List<Candidate> candidates = new ArrayList<>();
        candidates.add(new Candidate(trimmed, true)); // regex
        candidates.add(new Candidate(trimmed, false)); // literal
        if (!collapsed.equals(trimmed)) {
            candidates.add(new Candidate(collapsed, true));
            candidates.add(new Candidate(collapsed, false));
        }
        if (tolerant != null && !tolerant.equals(trimmed)) {
            candidates.add(new Candidate(tolerant, true));
        }

        for (Candidate c : candidates) {
            Map<Integer, List<PDFText>> m =
                    textRedactionService.findTextToRedact(
                            document, new String[] {c.pattern}, c.useRegex, false);
            if (!m.isEmpty()) {
                if (!c.pattern.equals(trimmed)) {
                    log.info(
                            "[redact/execute] range boundary matched via fallback: '{}' → '{}'",
                            trimmed,
                            c.pattern);
                }
                return m;
            }
        }
        return Collections.emptyMap();
    }

    private record Candidate(String pattern, boolean useRegex) {}

    /**
     * Joins {@code raw}'s alphanumeric runs with {@code \W*} so anchors match across punctuation
     * drift. Returns {@code null} when fewer than two tokens exist.
     */
    private static String punctuationTolerantRegex(String raw) {
        List<String> tokens = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (int i = 0; i < raw.length(); i++) {
            char ch = raw.charAt(i);
            if (Character.isLetterOrDigit(ch)) {
                current.append(ch);
            } else if (current.length() > 0) {
                tokens.add(current.toString());
                current.setLength(0);
            }
        }
        if (current.length() > 0) tokens.add(current.toString());
        if (tokens.size() < 2) return null;
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < tokens.size(); i++) {
            if (i > 0) out.append("\\W*");
            out.append(Pattern.quote(tokens.get(i)));
        }
        return out.toString();
    }

    /**
     * Collapses letter-spaced text produced by position-sorted text extraction.
     *
     * <p>When a PDF text stripper runs with {@code setSortByPosition(true)}, letter-spaced headings
     * (e.g. CSS {@code letter-spacing}) come out as {@code "T a b l e o f c o n t e n t s"} —
     * individual characters separated by single spaces, with double spaces between words. This
     * method converts the spaced form back to words.
     */
    private static String collapseLetterSpacing(String text) {
        String[] tokens = text.split(" ", -1);
        StringBuilder result = new StringBuilder();
        StringBuilder current = new StringBuilder();
        for (String token : tokens) {
            if (token.isEmpty()) {
                if (current.length() > 0) {
                    if (result.length() > 0) result.append(' ');
                    result.append(current);
                    current.setLength(0);
                }
            } else if (token.length() == 1) {
                current.append(token);
            } else {
                if (current.length() > 0) {
                    if (result.length() > 0) result.append(' ');
                    result.append(current);
                    current.setLength(0);
                }
                if (result.length() > 0) result.append(' ');
                result.append(token);
            }
        }
        if (current.length() > 0) {
            if (result.length() > 0) result.append(' ');
            result.append(current);
        }
        return result.toString().trim();
    }

    private static String[] cleanStrings(List<String> input) {
        if (input == null || input.isEmpty()) {
            return new String[0];
        }
        return input.stream()
                .filter(s -> s != null)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toArray(String[]::new);
    }

    /**
     * Converts 1-based page numbers from the request to the 0-based indices used internally. Out
     * of-range and non-positive values are silently dropped.
     */
    private static List<Integer> toZeroBasedIndices(List<Integer> oneBasedPageNumbers) {
        if (oneBasedPageNumbers == null || oneBasedPageNumbers.isEmpty()) {
            return new ArrayList<>();
        }
        List<Integer> result = new ArrayList<>();
        for (Integer page : oneBasedPageNumbers) {
            if (page != null && page > 0) {
                result.add(page - 1);
            }
        }
        return result;
    }

    private static List<float[]> toFloatArrays(List<RedactImageBox> boxes) {
        List<float[]> result = new ArrayList<>(boxes.size());
        for (RedactImageBox box : boxes) {
            result.add(
                    new float[] {
                        box.getPageIndex(), box.getX1(), box.getY1(), box.getX2(), box.getY2()
                    });
        }
        return result;
    }

    private static String trimOrEmpty(String s) {
        return s == null ? "" : s.trim();
    }
}
