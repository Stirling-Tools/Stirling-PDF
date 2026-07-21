package stirling.software.SPDF.controller.api.security;

import java.awt.Color;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
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
import stirling.software.SPDF.model.api.security.RedactExecuteRequest.ImageBox;
import stirling.software.SPDF.model.api.security.RedactExecuteRequest.RedactStyle;
import stirling.software.SPDF.model.api.security.RedactExecuteRequest.TextRange;
import stirling.software.SPDF.pdf.parser.PageColumnLayout;
import stirling.software.SPDF.pdf.parser.PageImageLocator;
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
        RedactStyle style = request.getStyle() != null ? request.getStyle() : new RedactStyle();
        List<String> textValues = orEmpty(request.getTextValues());
        List<String> regexPatterns = orEmpty(request.getRegexPatterns());
        List<Integer> wipePages = orEmpty(request.getWipePages());
        List<TextRange> ranges = orEmpty(request.getRanges());
        List<ImageBox> imageBoxes = orEmpty(request.getImageBoxes());

        boolean hasTargets =
                !textValues.isEmpty()
                        || !regexPatterns.isEmpty()
                        || !wipePages.isEmpty()
                        || !ranges.isEmpty()
                        || !imageBoxes.isEmpty()
                        || request.getRedactImagePages() != null;

        if (!hasTargets) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.redaction.no.targets", "No redaction targets provided");
        }

        boolean overlayOnly =
                RedactExecuteRequest.RedactionStrategy.OVERLAY_ONLY.equals(style.getStrategy());
        boolean imageFinalize =
                RedactExecuteRequest.RedactionStrategy.IMAGE_FINALIZE.equals(style.getStrategy());
        boolean convertToImage = imageFinalize || style.isConvertToImage();

        boolean hasTextOps = !textValues.isEmpty() || !regexPatterns.isEmpty();

        log.info(
                "[redact/execute] strategy={} textValues={} regexPatterns={} wipePages={} ranges={} imageBoxes={} imagePages={}",
                style.getStrategy(),
                textValues.size(),
                regexPatterns.size(),
                wipePages.size(),
                ranges.size(),
                imageBoxes.size(),
                request.getRedactImagePages());

        if (request.getFileInput() == null) {
            throw ExceptionUtils.createFileNullOrEmptyException();
        }

        PDDocument document = null;
        try {
            document = pdfDocumentFactory.load(request.getFileInput());

            // Single-pass text scan: collect all text-based targets so we run the PDF
            // stripper only once across the entire execute() call rather than once per target.
            Map<Integer, List<PDFText>> foundTexts =
                    hasTextOps ? collectTextMatches(document, request) : new HashMap<>();

            int totalMatches = foundTexts.values().stream().mapToInt(List::size).sum();
            log.info(
                    "[redact/execute] scan complete: {} text matches across {} pages",
                    totalMatches,
                    foundTexts.size());

            // Text removal (content-stream rewriting) — skipped in overlay-only mode.
            boolean needsOverlayOnly = overlayOnly;
            if (hasTextOps && !foundTexts.isEmpty() && !overlayOnly) {
                needsOverlayOnly = applyTextRemoval(document, request);
            } else if (overlayOnly) {
                log.info(
                        "[redact/execute] overlay-only mode requested — skipping content-stream rewriting");
            }

            // Reload fresh document on fallback so we overlay onto clean content.
            if (needsOverlayOnly && !foundTexts.isEmpty()) {
                log.info("[redact/execute] reloading document for clean overlay pass");
                document.close();
                document = pdfDocumentFactory.load(request.getFileInput());
                foundTexts.clear();
                if (hasTextOps) {
                    foundTexts.putAll(collectTextMatches(document, request));
                }
            }

            // Non-text operations.
            Map<Integer, PageColumnLayout> layoutCache = new HashMap<>();

            if (!wipePages.isEmpty()) {
                applyPageWipe(document, wipePages, style);
            }

            for (TextRange range : ranges) {
                applyRangeRedaction(document, range, style, layoutCache);
            }

            for (ImageBox box : imageBoxes) {
                applyImageBoxRedaction(document, box, style);
            }

            if (request.getRedactImagePages() != null) {
                applyAllImagesRedaction(document, request.getRedactImagePages(), style);
            }

            return manualRedactionService.finalizeRedaction(
                    document,
                    foundTexts,
                    style.getColor(),
                    style.getPadding(),
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
    // Single-pass text scan (one stripper pass per execute() call)
    // -----------------------------------------------------------------------

    /**
     * Runs a single PDF text-stripper pass over all text-based targets and returns the merged hit
     * map.
     */
    private Map<Integer, List<PDFText>> collectTextMatches(
            PDDocument document, RedactExecuteRequest request) {
        Map<Integer, List<PDFText>> found = new HashMap<>();

        String[] terms = cleanStrings(request.getTextValues());
        if (terms.length > 0) {
            textRedactionService
                    .findTextToRedact(document, terms, false, false)
                    .forEach(
                            (page, hits) ->
                                    found.computeIfAbsent(page, k -> new ArrayList<>())
                                            .addAll(hits));
        }

        String[] patterns = cleanStrings(request.getRegexPatterns());
        if (patterns.length > 0) {
            textRedactionService
                    .findTextToRedact(document, patterns, true, false)
                    .forEach(
                            (page, hits) ->
                                    found.computeIfAbsent(page, k -> new ArrayList<>())
                                            .addAll(hits));
        }

        return found;
    }

    // -----------------------------------------------------------------------
    // Text removal (content-stream rewriting)
    // -----------------------------------------------------------------------

    /**
     * Attempts content-stream text removal for all text/regex targets. Returns {@code true} if the
     * document fell back to overlay-only mode.
     */
    private boolean applyTextRemoval(PDDocument document, RedactExecuteRequest request) {
        try {
            boolean fallback = false;

            String[] terms = cleanStrings(request.getTextValues());
            if (terms.length > 0) {
                Map<Integer, List<PDFText>> exactFound =
                        textRedactionService.findTextToRedact(document, terms, false, false);
                if (!exactFound.isEmpty()) {
                    fallback |=
                            textRedactionService.performTextReplacement(
                                    document, exactFound, terms, false, false);
                }
            }

            String[] patterns = cleanStrings(request.getRegexPatterns());
            if (patterns.length > 0) {
                Map<Integer, List<PDFText>> regexFound =
                        textRedactionService.findTextToRedact(document, patterns, true, false);
                if (!regexFound.isEmpty()) {
                    fallback |=
                            textRedactionService.performTextReplacement(
                                    document, regexFound, patterns, true, false);
                }
            }

            if (fallback) {
                log.warn(
                        "[redact/execute] font compatibility issue — falling back to overlay-only");
            } else {
                log.info("[redact/execute] content-stream text removal applied successfully");
            }
            return fallback;
        } catch (Exception e) {
            log.warn(
                    "[redact/execute] text removal failed, falling back to overlay: {}",
                    e.getMessage());
            return true;
        }
    }

    // -----------------------------------------------------------------------
    // Per-operation dispatch methods
    // -----------------------------------------------------------------------

    private void applyPageWipe(PDDocument document, List<Integer> pageNumbers, RedactStyle style)
            throws IOException {
        List<Integer> pageIndices = toZeroBasedIndices(pageNumbers);
        if (pageIndices.isEmpty()) return;

        PDPageTree allPages = document.getDocumentCatalog().getPages();
        Color pageColor = ManualRedactionService.decodeOrDefault(style.getColor());
        Collections.sort(pageIndices);
        log.info("[redact/execute] full-page wipe: {} pages ({})", pageIndices.size(), pageIndices);

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

    private void applyRangeRedaction(
            PDDocument document,
            TextRange range,
            RedactStyle style,
            Map<Integer, PageColumnLayout> layoutCache)
            throws IOException {
        String rangeStart = trimOrEmpty(range.startString());
        String rangeEnd = trimOrEmpty(range.endString());
        log.info("[redact/execute] range redaction: start='{}' end='{}'", rangeStart, rangeEnd);
        try {
            List<PDFText> blocks = collectRangeBlocks(document, rangeStart, rangeEnd, layoutCache);
            if (!blocks.isEmpty()) {
                manualRedactionService.redactFoundText(
                        document,
                        blocks,
                        style.getPadding(),
                        ManualRedactionService.decodeOrDefault(style.getColor()),
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

    private void applyImageBoxRedaction(PDDocument document, ImageBox box, RedactStyle style)
            throws IOException {
        List<float[]> boxes =
                List.of(
                        new float[] {
                            (float) box.pageIndex(), box.x1(), box.y1(), box.x2(), box.y2()
                        });
        log.info("[redact/execute] image box overlay on page {}", box.pageIndex());
        Color boxColor = ManualRedactionService.decodeOrDefault(style.getColor());
        manualRedactionService.redactImageBoxes(document, boxes, boxColor);
    }

    private void applyAllImagesRedaction(
            PDDocument document, List<Integer> pageNumbers, RedactStyle style) throws IOException {
        PDPageTree allPages = document.getDocumentCatalog().getPages();
        Color imgColor = ManualRedactionService.decodeOrDefault(style.getColor());

        List<Integer> imagePageIndices = toZeroBasedIndices(pageNumbers);
        if (imagePageIndices.isEmpty()) {
            imagePageIndices = new ArrayList<>();
            for (int i = 0; i < allPages.getCount(); i++) {
                imagePageIndices.add(i);
            }
        }

        List<float[]> detectedBoxes = new ArrayList<>();
        for (int pageIdx : imagePageIndices) {
            if (pageIdx < 0 || pageIdx >= allPages.getCount()) continue;
            try {
                PDPage page = allPages.get(pageIdx);
                PageImageLocator locator = new PageImageLocator(page, pageIdx);
                locator.processPage(page);
                for (PageImageLocator.ImageBox ib : locator.getImageBoxes()) {
                    detectedBoxes.add(new float[] {pageIdx, ib.x1(), ib.y1(), ib.x2(), ib.y2()});
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
     * Collects all redactable content (text line segments and images) between two anchor positions.
     *
     * <p>Line boxes are cached per page number in {@code lineBoxCache} and reused across range
     * iterations within one execute() call, avoiding redundant {@link AllTextLineExtractor} passes.
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
        // Use bottom of end anchor so the end anchor line itself is included (inclusive range).
        float endY = openEnded ? Float.POSITIVE_INFINITY : end.text.getY2();

        // Line-box cache: populated lazily per page, reused across range iterations.
        // Cannot use computeIfAbsent because AllTextLineExtractor's constructor throws IOException.
        Map<Integer, List<float[]>> lineBoxCache = new HashMap<>();

        for (int pageIdx = startPage; pageIdx <= endPage; pageIdx++) {
            PDPage page = allPages.get(pageIdx);
            float pageHeight = page.getBBox().getHeight();
            PageColumnLayout layout = layoutFor(document, pageIdx, layoutCache);

            List<float[]> screenLineBoxes = lineBoxCache.get(pageIdx);
            if (screenLineBoxes == null) {
                AllTextLineExtractor textExtractor =
                        new AllTextLineExtractor(pageIdx + 1, pageHeight);
                textExtractor.getText(document);
                screenLineBoxes = textExtractor.getScreenLineBoxes();
                lineBoxCache.put(pageIdx, screenLineBoxes);
            }

            for (float[] sb : screenLineBoxes) {
                emitColumnSlices(
                        pageIdx, layout, sb[0], sb[2], sb[1], sb[3], start.col, startPage, startY,
                        endCol, endPage, endY, blocks);
            }

            PageImageLocator imgLocator = new PageImageLocator(page, pageIdx);
            imgLocator.processPage(page);
            for (PageImageLocator.ImageBox ib : imgLocator.getImageBoxes()) {
                // ImageBox coordinates are in PDF user-space (Y up); convert to screen-Y (Y down).
                float screenY1 = pageHeight - ib.y2();
                float screenY2 = pageHeight - ib.y1();
                emitColumnSlices(
                        pageIdx, layout, ib.x1(), ib.x2(), screenY1, screenY2, start.col, startPage,
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
            if (inColumnZone(
                    pageIdx, cols[0], yTop, yBottom, startPage, startCol, startY, endPage, endCol,
                    endY)) {
                blocks.add(new PDFText(pageIdx, x1, yTop, x2, yBottom, ""));
            }
            return;
        }
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
     * start anchor (inclusive) and end anchor (inclusive).
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
                return col == startCol && yBottom >= startY && yBottom <= endY;
            }
            if (startCol < endCol) {
                if (col < startCol || col > endCol) return false;
                if (col == startCol) return yBottom >= startY;
                if (col == endCol) return yBottom <= endY;
                return true;
            }
            return col == startCol && yBottom >= startY;
        }
        if (pageIdx == startPage) {
            if (col == startCol) return yBottom >= startY;
            return col > startCol;
        }
        if (pageIdx == endPage) {
            if (col == endCol) return yBottom <= endY;
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
        candidates.add(new Candidate(trimmed, true));
        candidates.add(new Candidate(trimmed, false));
        if (!collapsed.equals(trimmed)) {
            candidates.add(new Candidate(collapsed, true));
            candidates.add(new Candidate(collapsed, false));
        }
        if (tolerant != null && !tolerant.equals(trimmed)) {
            candidates.add(new Candidate(tolerant, true));
        }

        // If the anchor spans multiple lines (model provided entire paragraph instead of a short
        // phrase), try just the first non-empty line — it's usually sufficient to locate the
        // position and avoids mismatches from mid-paragraph text extraction artifacts.
        if (trimmed.contains("\n")) {
            String firstLine =
                    Arrays.stream(trimmed.split("\n"))
                            .map(String::trim)
                            .filter(s -> !s.isEmpty())
                            .findFirst()
                            .orElse(null);
            if (firstLine != null && firstLine.length() >= 4) {
                String firstLineCollapsed = collapseLetterSpacing(firstLine);
                String firstLineTolerant = punctuationTolerantRegex(firstLine);
                candidates.add(new Candidate(firstLine, false));
                if (!firstLineCollapsed.equals(firstLine)) {
                    candidates.add(new Candidate(firstLineCollapsed, false));
                }
                if (firstLineTolerant != null && !firstLineTolerant.equals(firstLine)) {
                    candidates.add(new Candidate(firstLineTolerant, true));
                }
            }
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

    // -----------------------------------------------------------------------
    // Static helpers
    // -----------------------------------------------------------------------

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
     * come out as {@code "T a b l e o f c o n t e n t s"}. This method converts the spaced form
     * back to words.
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

    private static <T> List<T> orEmpty(List<T> list) {
        return list != null ? list : List.of();
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
     * Converts 1-based page numbers from the request to the 0-based indices used internally.
     * Out-of-range and non-positive values are silently dropped.
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

    private static String trimOrEmpty(String s) {
        return s == null ? "" : s.trim();
    }
}
