package stirling.software.SPDF.controller.api.security;

import java.awt.Color;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.PDFText;
import stirling.software.SPDF.model.api.security.ManualRedactPdfRequest;
import stirling.software.SPDF.pdf.parser.PageImageLocator;
import stirling.software.SPDF.pdf.redaction.RedactionPipeline;
import stirling.software.common.model.api.security.RedactionArea;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.PdfUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@Service
@Slf4j
@RequiredArgsConstructor
class ManualRedactionService {

    private static final float DEFAULT_TEXT_PADDING_MULTIPLIER = 0.6f;
    private static final float REDACTION_WIDTH_REDUCTION_FACTOR = 0.9f;

    private final TempFileManager tempFileManager;

    // -----------------------------------------------------------------------
    // Area and page redaction
    // -----------------------------------------------------------------------

    AreaRedactionResult redactAreas(
            List<RedactionArea> redactionAreas, PDDocument document, PDPageTree allPages)
            throws IOException {

        Set<String> capturedStrings = new LinkedHashSet<>();
        Map<Integer, List<PDRectangle>> rectsByPage = new HashMap<>();

        if (redactionAreas == null || redactionAreas.isEmpty()) {
            return new AreaRedactionResult(rectsByPage);
        }

        Map<Integer, List<RedactionArea>> redactionsByPage = new HashMap<>();

        for (RedactionArea redactionArea : redactionAreas) {
            if (redactionArea.getPage() == null
                    || redactionArea.getPage() <= 0
                    || redactionArea.getHeight() == null
                    || redactionArea.getHeight() <= 0.0D
                    || redactionArea.getWidth() == null
                    || redactionArea.getWidth() <= 0.0D) {
                continue;
            }

            redactionsByPage
                    .computeIfAbsent(redactionArea.getPage(), k -> new ArrayList<>())
                    .add(redactionArea);
        }

        for (Map.Entry<Integer, List<RedactionArea>> entry : redactionsByPage.entrySet()) {
            Integer pageNumber = entry.getKey();
            List<RedactionArea> areasForPage = entry.getValue();

            if (pageNumber > allPages.getCount()) {
                continue;
            }

            int pageIndex = pageNumber - 1;
            PDPage page = allPages.get(pageIndex);
            float pageHeight = page.getBBox().getHeight();

            List<PDRectangle> rects = new ArrayList<>();
            Color overlayColor = Color.BLACK;
            for (RedactionArea area : areasForPage) {
                float x = area.getX().floatValue();
                float y = area.getY().floatValue();
                float width = area.getWidth().floatValue();
                float height = area.getHeight().floatValue();
                // Request coords are top-left origin; convert to PDF user space (bottom-left).
                float pdfY = pageHeight - y - height;
                rects.add(new PDRectangle(x, pdfY, width, height));
                overlayColor = decodeOrDefault(area.getColor());
            }

            // Physically drop intersecting glyphs and draw the overlay rectangle over the area.
            Map<Integer, List<PDRectangle>> singlePage = new HashMap<>();
            singlePage.put(pageIndex, rects);
            RedactionPipeline.RedactionResult result =
                    RedactionPipeline.redactAreas(document, singlePage, overlayColor);
            capturedStrings.addAll(result.getCapturedStrings());
            rectsByPage.put(pageIndex, rects);
        }

        log.debug(
                "Manual area redaction captured {} text run(s) across {} page(s)",
                capturedStrings.size(),
                rectsByPage.size());
        return new AreaRedactionResult(rectsByPage);
    }

    List<Integer> redactPages(
            ManualRedactPdfRequest request, PDDocument document, PDPageTree allPages)
            throws IOException {

        Color redactColor = decodeOrDefault(request.getPageRedactionColor());
        List<Integer> pageIndexes = getPageNumbers(request, allPages.getCount());

        // Whole-page wipe: drop the content stream, resources and annotations, then fill.
        RedactionPipeline.redactWholePages(document, pageIndexes, redactColor);
        return new ArrayList<>(pageIndexes);
    }

    // -----------------------------------------------------------------------
    // Overlay drawing
    // -----------------------------------------------------------------------

    void redactFoundText(
            PDDocument document,
            List<PDFText> blocks,
            float customPadding,
            Color redactColor,
            boolean isTextRemovalMode)
            throws IOException {

        var allPages = document.getDocumentCatalog().getPages();

        Map<Integer, List<PDFText>> blocksByPage = new HashMap<>();
        for (PDFText block : blocks) {
            blocksByPage.computeIfAbsent(block.getPageIndex(), k -> new ArrayList<>()).add(block);
        }

        for (Map.Entry<Integer, List<PDFText>> entry : blocksByPage.entrySet()) {
            Integer pageIndex = entry.getKey();
            List<PDFText> pageBlocks = entry.getValue();

            if (pageIndex >= allPages.getCount()) {
                continue;
            }

            var page = allPages.get(pageIndex);
            try (PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {

                contentStream.saveGraphicsState();

                try {
                    contentStream.setNonStrokingColor(redactColor);
                    PDRectangle pageBox = page.getBBox();

                    for (PDFText block : pageBlocks) {
                        float padding =
                                (block.getY2() - block.getY1()) * DEFAULT_TEXT_PADDING_MULTIPLIER
                                        + customPadding;

                        float originalWidth = block.getX2() - block.getX1();
                        float boxWidth;
                        float boxX;

                        if (isTextRemovalMode) {
                            boxWidth = originalWidth * REDACTION_WIDTH_REDUCTION_FACTOR;
                            float widthReduction = originalWidth - boxWidth;
                            boxX = block.getX1() + (widthReduction / 2);
                        } else {
                            boxWidth = originalWidth;
                            boxX = block.getX1();
                        }

                        contentStream.addRect(
                                boxX,
                                pageBox.getHeight() - block.getY2() - padding,
                                boxWidth,
                                block.getY2() - block.getY1() + 2 * padding);
                    }

                    contentStream.fill();

                } finally {
                    contentStream.restoreGraphicsState();
                }
            }

            // Remove annotations whose bounding rect overlaps a redacted block, to prevent
            // users from hovering over redacted URLs and seeing the underlying destination.
            try {
                float pageH = page.getBBox().getHeight();
                List<PDAnnotation> kept = new ArrayList<>();
                for (PDAnnotation ann : page.getAnnotations()) {
                    PDRectangle ar = ann.getRectangle();
                    boolean overlaps = false;
                    if (ar != null) {
                        for (PDFText block : pageBlocks) {
                            float padding =
                                    (block.getY2() - block.getY1())
                                                    * DEFAULT_TEXT_PADDING_MULTIPLIER
                                            + customPadding;
                            float bx1 = block.getX1();
                            float bx2 = block.getX2();
                            float by1 = pageH - block.getY2() - padding;
                            float by2 = pageH - block.getY1() + padding;
                            if (ar.getLowerLeftX() < bx2
                                    && ar.getUpperRightX() > bx1
                                    && ar.getLowerLeftY() < by2
                                    && ar.getUpperRightY() > by1) {
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
                log.debug(
                        "[redact] could not remove annotations on page {}: {}",
                        pageIndex,
                        e.getMessage());
            }
        }
    }

    void redactImageBoxes(PDDocument document, List<float[]> imageBoxes, Color color)
            throws IOException {
        Map<Integer, List<float[]>> byPage = new HashMap<>();
        for (float[] box : imageBoxes) {
            byPage.computeIfAbsent((int) box[0], k -> new ArrayList<>()).add(box);
        }
        PDPageTree pages = document.getDocumentCatalog().getPages();
        for (Map.Entry<Integer, List<float[]>> entry : byPage.entrySet()) {
            int pageIdx = entry.getKey();
            if (pageIdx < 0 || pageIdx >= pages.getCount()) {
                log.warn("[redact/execute] image box references out-of-range page {}", pageIdx);
                continue;
            }
            PDPage page = pages.get(pageIdx);
            try (PDPageContentStream cs =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {
                cs.saveGraphicsState();
                cs.setNonStrokingColor(color);
                for (float[] box : entry.getValue()) {
                    float x1 = box[1], y1 = box[2], x2 = box[3], y2 = box[4];
                    cs.addRect(x1, y1, x2 - x1, y2 - y1);
                }
                cs.fill();
                cs.restoreGraphicsState();
            }
        }
    }

    // -----------------------------------------------------------------------
    // Page element extraction
    // -----------------------------------------------------------------------

    /**
     * Returns bounding boxes for every text line and image on {@code page} in PDF user-space
     * coordinates: {@code [x1, y1, x2, y2]} (origin bottom-left, Y increases upward).
     */
    List<float[]> extractPageElementBoxes(PDDocument document, PDPage page, int pageIndex)
            throws IOException {
        List<float[]> boxes = new ArrayList<>();

        AllTextLineExtractor textExtractor =
                new AllTextLineExtractor(pageIndex + 1, page.getBBox().getHeight());
        textExtractor.getText(document);
        boxes.addAll(textExtractor.getLineBoxes());

        PageImageLocator imgLocator = new PageImageLocator(page, pageIndex);
        imgLocator.processPage(page);
        for (PageImageLocator.ImageBox imgBox : imgLocator.getImageBoxes()) {
            boxes.add(new float[] {imgBox.x1(), imgBox.y1(), imgBox.x2(), imgBox.y2()});
        }

        return boxes;
    }

    // -----------------------------------------------------------------------
    // Finalization
    // -----------------------------------------------------------------------

    TempFile finalizeRedaction(
            PDDocument document,
            Map<Integer, List<PDFText>> allFoundTextsByPage,
            String colorString,
            float customPadding,
            Boolean convertToImage,
            boolean isTextRemovalMode,
            Set<String> literalTargets,
            List<Pattern> patterns)
            throws IOException {

        List<PDFText> allFoundTexts = new ArrayList<>();
        for (List<PDFText> pageTexts : allFoundTextsByPage.values()) {
            allFoundTexts.addAll(pageTexts);
        }

        if (!allFoundTexts.isEmpty()) {
            Color redactColor = decodeOrDefault(colorString);
            redactFoundText(document, allFoundTexts, customPadding, redactColor, isTextRemovalMode);
        }

        byte[] outputBytes;
        if (Boolean.TRUE.equals(convertToImage)) {
            try (PDDocument convertedPdf = PdfUtils.convertPdfToPdfImage(document)) {
                // Convert-to-image physically removes all text, so verification is a plain save.
                outputBytes =
                        RedactionPipeline.finalize(
                                convertedPdf, Collections.emptySet(), Collections.emptyList());
            }
        } else {
            // True-removal pass: physically strip matched glyph bytes from every content stream,
            // then scrub catalog carriers, verify, and rasterise affected pages on any leak.
            RedactionPipeline.redactLiteralTerms(document, literalTargets, patterns);
            outputBytes = RedactionPipeline.finalize(document, literalTargets, patterns);
        }

        return writeBytes(outputBytes, document.getNumberOfPages());
    }

    /**
     * Finalize a manual area/page redaction. The overlay rectangles are already drawn and the
     * intersecting glyphs already dropped. Verification is region-based: each redaction rectangle
     * is re-scanned and must be empty (whole-page wipes carry no rects and are guaranteed clean).
     */
    TempFile finalizeManual(
            PDDocument document,
            Map<Integer, List<PDRectangle>> rectsByPage,
            Boolean convertToImage)
            throws IOException {

        byte[] outputBytes;
        if (Boolean.TRUE.equals(convertToImage)) {
            try (PDDocument convertedPdf = PdfUtils.convertPdfToPdfImage(document)) {
                outputBytes =
                        RedactionPipeline.finalize(
                                convertedPdf, Collections.emptySet(), Collections.emptyList());
            }
        } else {
            outputBytes = RedactionPipeline.finalizeAreas(document, rectsByPage);
        }

        return writeBytes(outputBytes, document.getNumberOfPages());
    }

    private TempFile writeBytes(byte[] outputBytes, int pageCount) throws IOException {
        TempFile tempOut = tempFileManager.createManagedTempFile(".pdf");
        try {
            java.nio.file.Files.write(tempOut.getFile().toPath(), outputBytes);
        } catch (IOException e) {
            tempOut.close();
            throw e;
        }

        log.info("Redaction finalized: {} pages -> {} KB", pageCount, outputBytes.length / 1024);
        return tempOut;
    }

    // -----------------------------------------------------------------------
    // Utilities
    // -----------------------------------------------------------------------

    /** Redaction rectangles (per 0-based page index) applied by a manual area pass. */
    static final class AreaRedactionResult {
        final Map<Integer, List<PDRectangle>> rectsByPage;

        AreaRedactionResult(Map<Integer, List<PDRectangle>> rectsByPage) {
            this.rectsByPage = rectsByPage;
        }
    }

    static Color decodeOrDefault(String hex) {
        if (hex == null) {
            return Color.BLACK;
        }

        String colorString = hex.startsWith("#") ? hex : "#" + hex;

        try {
            return Color.decode(colorString);
        } catch (NumberFormatException e) {
            return Color.BLACK;
        }
    }

    private List<Integer> getPageNumbers(ManualRedactPdfRequest request, int pagesCount) {
        String pageNumbersInput = request.getPageNumbers();
        String[] parsedPageNumbers =
                pageNumbersInput != null ? pageNumbersInput.split(",") : new String[0];
        List<Integer> pageNumbers =
                GeneralUtils.parsePageList(parsedPageNumbers, pagesCount, false);
        Collections.sort(pageNumbers);
        return pageNumbers;
    }
}
