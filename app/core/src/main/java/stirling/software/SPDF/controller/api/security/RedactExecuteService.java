package stirling.software.SPDF.controller.api.security;

import java.awt.Color;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

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
        boolean hasRedactAllImages = Boolean.TRUE.equals(request.getRedactAllImages());

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
        boolean convertToImage =
                imageFinalize || Boolean.TRUE.equals(request.getConvertPDFToImage());

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
                for (RedactTextRange range : textRanges) {
                    String rangeStart = trimOrEmpty(range.getStartString());
                    String rangeEnd = trimOrEmpty(range.getEndString());
                    try {
                        List<PDFText> blocks = collectRangeBlocks(document, rangeStart, rangeEnd);
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
     */
    private List<PDFText> collectRangeBlocks(PDDocument document, String startStr, String endStr)
            throws IOException {

        PDPageTree allPages = document.getDocumentCatalog().getPages();
        int totalPages = allPages.getCount();

        Map<Integer, List<PDFText>> startMatchesByPage = findWithFallbacks(document, startStr);
        if (startMatchesByPage.isEmpty()) {
            log.warn("[redact/execute] range start not found: '{}'", startStr);
            return Collections.emptyList();
        }

        List<int[]> startPageList = new ArrayList<>();
        List<PDFText> startTextList = new ArrayList<>();
        for (int page : startMatchesByPage.keySet().stream().sorted().toList()) {
            List<PDFText> hits = new ArrayList<>(startMatchesByPage.get(page));
            hits.sort(Comparator.comparingDouble(PDFText::getY1));
            for (PDFText t : hits) {
                startPageList.add(new int[] {page});
                startTextList.add(t);
            }
        }

        boolean openEnded = (endStr == null || endStr.isBlank());
        List<Integer> endPageList = new ArrayList<>();
        List<PDFText> endTextList = new ArrayList<>();
        if (!openEnded) {
            Map<Integer, List<PDFText>> endMatchesByPage = findWithFallbacks(document, endStr);
            if (endMatchesByPage.isEmpty()) {
                log.warn(
                        "[redact/execute] range end not found: '{}' — redacting to end of document",
                        endStr);
                openEnded = true;
            } else {
                for (int page : endMatchesByPage.keySet().stream().sorted().toList()) {
                    List<PDFText> hits = new ArrayList<>(endMatchesByPage.get(page));
                    hits.sort(Comparator.comparingDouble(PDFText::getY1));
                    for (PDFText t : hits) {
                        endPageList.add(page);
                        endTextList.add(t);
                    }
                }
            }
        }

        List<PDFText> blocks = new ArrayList<>();
        for (int si = 0; si < startTextList.size(); si++) {
            int startPage = startPageList.get(si)[0];
            PDFText startText = startTextList.get(si);

            int endPage;
            PDFText endText = null;
            if (openEnded) {
                endPage = totalPages - 1;
            } else {
                endPage = -1;
                for (int ei = 0; ei < endTextList.size(); ei++) {
                    int ep = endPageList.get(ei);
                    PDFText et = endTextList.get(ei);
                    boolean after =
                            ep > startPage || (ep == startPage && et.getY1() > startText.getY1());
                    if (after) {
                        endPage = ep;
                        endText = et;
                        break;
                    }
                }
                if (endPage == -1) {
                    log.debug(
                            "[redact/execute] no end anchor after start at page {}, skipping",
                            startPage + 1);
                    continue;
                }
            }

            log.info(
                    "[redact/execute] range pages {}-{}: start='{}' end='{}'",
                    startPage + 1,
                    endPage + 1,
                    startStr,
                    openEnded ? "<end of document>" : endStr);

            collectBlocksForRange(
                    document, allPages, startPage, startText, endPage, endText, blocks);
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
     */
    private void collectBlocksForRange(
            PDDocument document,
            PDPageTree allPages,
            int startPage,
            PDFText startText,
            int endPage,
            PDFText endText,
            List<PDFText> blocks)
            throws IOException {

        for (int pageIdx = startPage; pageIdx <= endPage; pageIdx++) {
            PDPage page = allPages.get(pageIdx);
            float pageHeight = page.getBBox().getHeight();

            // Coordinate systems:
            //   PDFText / screen: Y1=top (smaller screen Y). Y increases downward.
            //   AllTextLineExtractor output: lb=[x1, pdfY_bot, x2, pdfY_top]. Y increases upward.
            //   Conversion: screenY = pageHeight - pdfY.

            float startThreshold =
                    (pageIdx == startPage) ? pageHeight - startText.getY1() : Float.MAX_VALUE;

            float endThreshold =
                    (pageIdx == endPage && endText != null)
                            ? pageHeight - endText.getY1()
                            : -Float.MAX_VALUE;

            AllTextLineExtractor textExtractor = new AllTextLineExtractor(pageIdx + 1, pageHeight);
            textExtractor.getText(document);
            for (float[] lb : textExtractor.getLineBoxes()) {
                // lb = [x1, pdfY_bottom, x2, pdfY_top]
                if (lb[3] > startThreshold || lb[1] <= endThreshold) {
                    continue;
                }
                float screenY1 = pageHeight - lb[3];
                float screenY2 = pageHeight - lb[1];
                blocks.add(new PDFText(pageIdx, lb[0], screenY1, lb[2], screenY2, ""));
            }

            PageImageExtractor imgExtractor = new PageImageExtractor(page);
            imgExtractor.processPage(page);
            for (float[] ib : imgExtractor.getImageBoxes()) {
                // ib = [x1, pdfY_bottom, x2, pdfY_top]
                if (ib[3] > startThreshold || ib[1] <= endThreshold) {
                    continue;
                }
                float screenY1 = pageHeight - ib[3];
                float screenY2 = pageHeight - ib[1];
                blocks.add(new PDFText(pageIdx, ib[0], screenY1, ib[2], screenY2, ""));
            }
        }
    }

    /**
     * Runs {@link #findTextToRedact} against the raw string, then a letter-spacing-collapsed
     * fallback (fixes "T a b l e" → "Table"), until a match is found.
     */
    private Map<Integer, List<PDFText>> findWithFallbacks(PDDocument document, String raw) {
        String trimmed = raw.trim();
        String collapsed = collapseLetterSpacing(trimmed);
        List<String> candidates =
                trimmed.equals(collapsed) ? List.of(trimmed) : List.of(trimmed, collapsed);
        for (String candidate : candidates) {
            Map<Integer, List<PDFText>> m =
                    textRedactionService.findTextToRedact(
                            document, new String[] {candidate}, true, false);
            if (m.isEmpty()) {
                m =
                        textRedactionService.findTextToRedact(
                                document, new String[] {candidate}, false, false);
            }
            if (!m.isEmpty()) {
                if (!candidate.equals(trimmed)) {
                    log.info(
                            "[redact/execute] range boundary matched via fallback: '{}' → '{}'",
                            trimmed,
                            candidate);
                }
                return m;
            }
        }
        return Collections.emptyMap();
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
