package stirling.software.SPDF.controller.api.security;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.PDFText;
import stirling.software.SPDF.model.api.security.ManualRedactPdfRequest;
import stirling.software.SPDF.model.api.security.PdfiumRedactionRegion;
import stirling.software.SPDF.model.api.security.RedactPdfRequest;
import stirling.software.SPDF.pdf.TextFinder;
import stirling.software.SPDF.service.redaction.PdfiumRedactionService;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.SecurityApi;
import stirling.software.common.model.api.security.RedactionArea;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.PdfUtils;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.common.util.propertyeditor.StringToArrayListPropertyEditor;

@SecurityApi
@Slf4j
@RequiredArgsConstructor
public class RedactController {

    private static final float DEFAULT_TEXT_PADDING_MULTIPLIER = 0.6f;
    private static final float REDACTION_WIDTH_REDUCTION_FACTOR = 0.9f;

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final PdfiumRedactionService pdfiumRedactionService;

    private String removeFileExtension(String filename) {
        return GeneralUtils.removeExtension(filename);
    }

    @InitBinder
    public void initBinder(WebDataBinder binder) {
        binder.registerCustomEditor(
                List.class, "redactions", new StringToArrayListPropertyEditor());
    }

    @AutoJobPostMapping(value = "/redact", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @StandardPdfResponse
    @Operation(
            operationId = "redactPdfManual",
            summary = "Redacts areas and pages in a PDF document",
            description =
                    "This endpoint redacts content from a PDF file based on manually specified areas. "
                            + "Users can specify areas to redact and optionally convert the PDF to an image. "
                            + "Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> redactPDF(@ModelAttribute ManualRedactPdfRequest request)
            throws IOException {

        MultipartFile file = request.getFileInput();
        List<RedactionArea> redactionAreas = request.getRedactions();

        try (PDDocument document = pdfDocumentFactory.load(file)) {
            PDPageTree allPages = document.getDocumentCatalog().getPages();

            redactPages(request, document, allPages);

            redactAreas(redactionAreas, document, allPages);

            if (Boolean.TRUE.equals(request.getConvertPDFToImage())) {
                try (PDDocument convertedPdf = PdfUtils.convertPdfToPdfImage(document);
                        ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                    convertedPdf.save(baos);
                    byte[] pdfContent = baos.toByteArray();

                    return WebResponseUtils.bytesToWebResponse(
                            pdfContent,
                            removeFileExtension(
                                            Objects.requireNonNull(
                                                    Filenames.toSimpleFileName(
                                                            file.getOriginalFilename())))
                                    + "_redacted.pdf");
                }
            }

            try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                document.save(baos);
                byte[] pdfContent = baos.toByteArray();

                return WebResponseUtils.bytesToWebResponse(
                        pdfContent,
                        removeFileExtension(
                                        Objects.requireNonNull(
                                                Filenames.toSimpleFileName(
                                                        file.getOriginalFilename())))
                                + "_redacted.pdf");
            }
        }
    }

    private void redactAreas(
            List<RedactionArea> redactionAreas, PDDocument document, PDPageTree allPages)
            throws IOException {

        if (redactionAreas == null || redactionAreas.isEmpty()) {
            return;
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
                continue; // Skip if the page number is out of bounds
            }

            PDPage page = allPages.get(pageNumber - 1);

            try (PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {

                contentStream.saveGraphicsState();
                for (RedactionArea redactionArea : areasForPage) {
                    Color redactColor = decodeOrDefault(redactionArea.getColor());

                    contentStream.setNonStrokingColor(redactColor);

                    float x = redactionArea.getX().floatValue();
                    float y = redactionArea.getY().floatValue();
                    float width = redactionArea.getWidth().floatValue();
                    float height = redactionArea.getHeight().floatValue();

                    float pdfY = page.getBBox().getHeight() - y - height;

                    contentStream.addRect(x, pdfY, width, height);
                    contentStream.fill();
                }
                contentStream.restoreGraphicsState();
            }
        }
    }

    private void redactPages(
            ManualRedactPdfRequest request, PDDocument document, PDPageTree allPages)
            throws IOException {

        Color redactColor = decodeOrDefault(request.getPageRedactionColor());
        List<Integer> pageNumbers = getPageNumbers(request, allPages.getCount());

        for (Integer pageNumber : pageNumbers) {

            PDPage page = allPages.get(pageNumber);

            try (PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {
                contentStream.setNonStrokingColor(redactColor);

                PDRectangle box = page.getBBox();

                contentStream.addRect(0, 0, box.getWidth(), box.getHeight());
                contentStream.fill();
            }
        }
    }

    private void redactFoundText(
            PDDocument document,
            List<PDFText> blocks,
            float customPadding,
            Color redactColor,
            boolean isTextRemovalMode)
            throws IOException {

        log.debug(
                "Starting box overlay redaction: {} blocks, customPadding={}, textRemovalMode={}, color=rgb({},{},{})",
                blocks.size(),
                customPadding,
                isTextRemovalMode,
                redactColor.getRed(),
                redactColor.getGreen(),
                redactColor.getBlue());

        var allPages = document.getDocumentCatalog().getPages();

        Map<Integer, List<PDFText>> blocksByPage = new HashMap<>();
        for (PDFText block : blocks) {
            blocksByPage.computeIfAbsent(block.getPageIndex(), k -> new ArrayList<>()).add(block);
        }

        for (Map.Entry<Integer, List<PDFText>> entry : blocksByPage.entrySet()) {
            Integer pageIndex = entry.getKey();
            List<PDFText> pageBlocks = entry.getValue();

            if (pageIndex >= allPages.getCount()) {
                log.warn(
                        "Skipping page index {} (out of bounds, total pages: {})",
                        pageIndex,
                        allPages.getCount());
                continue; // Skip if page index is out of bounds
            }

            log.debug("Drawing {} redaction boxes on page {}", pageBlocks.size(), pageIndex + 1);

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

                        // Only apply width reduction when text is actually being removed
                        if (isTextRemovalMode) {
                            // Calculate reduced width and center the box
                            boxWidth =
                                    originalWidth
                                            * REDACTION_WIDTH_REDUCTION_FACTOR; // 10% reduction
                            float widthReduction = originalWidth - boxWidth;
                            boxX = block.getX1() + (widthReduction / 2); // Center the reduced box
                        } else {
                            // Use original width for box-only redaction
                            boxWidth = originalWidth;
                            boxX = block.getX1();
                        }

                        float rectX = boxX;
                        float rectY = pageBox.getHeight() - block.getY2() - padding;
                        float rectWidth = boxWidth;
                        float rectHeight = block.getY2() - block.getY1() + 2 * padding;

                        log.debug(
                                "Drawing box for text='{}' at rect=({:.2f},{:.2f},{:.2f},{:.2f}) "
                                        + "textBounds=({:.2f},{:.2f},{:.2f},{:.2f}) padding={:.2f} widthReduction={}",
                                block.getText(),
                                rectX,
                                rectY,
                                rectWidth,
                                rectHeight,
                                block.getX1(),
                                block.getY1(),
                                block.getX2(),
                                block.getY2(),
                                padding,
                                isTextRemovalMode ? "applied" : "none");

                        contentStream.addRect(rectX, rectY, rectWidth, rectHeight);
                    }

                    contentStream.fill();
                    log.debug(
                            "Filled {} redaction boxes on page {}",
                            pageBlocks.size(),
                            pageIndex + 1);

                } finally {
                    contentStream.restoreGraphicsState();
                }
            }
        }
    }

    Color decodeOrDefault(String hex) {
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

    @AutoJobPostMapping(value = "/auto-redact", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @StandardPdfResponse
    @Operation(
            summary = "Redact PDF automatically",
            operationId = "redactPdfAuto",
            description =
                    "This endpoint automatically redacts text from a PDF file based on specified patterns. "
                            + "Users can provide text patterns to redact, with options for regex and whole word matching. "
                            + "Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> redactPdf(@ModelAttribute RedactPdfRequest request)
            throws IOException {
        boolean useRegex = Boolean.TRUE.equals(request.getUseRegex());
        boolean wholeWordSearchBool = Boolean.TRUE.equals(request.getWholeWordSearch());
        boolean drawBlackBoxes = true;
        String[] listOfText = parseListOfText(request.getListOfText(), useRegex);

        if (listOfText.length == 0) {
            throw new IllegalArgumentException("No text patterns provided for redaction");
        }

        if (request.getFileInput() == null) {
            log.error("File input is null");
            throw new IllegalArgumentException("File input cannot be null");
        }

        byte[] originalBytes = request.getFileInput().getBytes();

        try (PDDocument initialDocument = pdfDocumentFactory.load(originalBytes)) {
            if (initialDocument == null) {
                log.error("Failed to load PDF document");
                throw new IllegalArgumentException("Failed to load PDF document");
            }

            Map<Integer, List<PDFText>> overlayTargets = new HashMap<>();
            byte[] currentBytes = originalBytes;
            boolean pdfiumAvailable = ensurePdfiumAvailability();
            boolean anyPdfiumApplied = false;
            int totalMatchesFound = 0;

            for (String searchTerm : listOfText) {
                String trimmedTerm = searchTerm.trim();
                if (trimmedTerm.isEmpty()) continue;

                log.debug("Processing search term: '{}'", trimmedTerm);

                // Process each term with a fresh document instance
                try (PDDocument document =
                        pdfDocumentFactory.load(anyPdfiumApplied ? currentBytes : originalBytes)) {

                    Map<Integer, List<PDFText>> termMatches =
                            findTextToRedact(
                                    document,
                                    new String[] {trimmedTerm},
                                    useRegex,
                                    wholeWordSearchBool);

                    if (termMatches.isEmpty()) {
                        log.debug("No matches found for term '{}'", trimmedTerm);
                        continue;
                    }

                    int termMatchCount = termMatches.values().stream().mapToInt(List::size).sum();
                    totalMatchesFound += termMatchCount;
                    log.debug("Found {} matches for term '{}'", termMatchCount, trimmedTerm);

                    // Try PDFium redaction for this term
                    if (pdfiumAvailable) {
                        Optional<byte[]> pdfiumResult =
                                tryPdfiumTextRemoval(
                                        currentBytes,
                                        request.getFileInput().getOriginalFilename(),
                                        document,
                                        termMatches,
                                        request.getCustomPadding(),
                                        drawBlackBoxes);

                        if (pdfiumResult.isPresent()) {
                            byte[] processedBytes = pdfiumResult.get();
                            currentBytes = processedBytes;
                            anyPdfiumApplied = true;
                            log.debug("PDFium successfully processed term '{}'", trimmedTerm);

                            try (PDDocument verifyDoc = pdfDocumentFactory.load(processedBytes)) {
                                Map<Integer, List<PDFText>> remainingForTerm =
                                        findTextToRedact(
                                                verifyDoc,
                                                new String[] {trimmedTerm},
                                                useRegex,
                                                wholeWordSearchBool);

                                if (!remainingForTerm.isEmpty()) {
                                    int remainingCount =
                                            remainingForTerm.values().stream()
                                                    .mapToInt(List::size)
                                                    .sum();
                                    log.warn(
                                            "PDFium left {} residual matches for term '{}'; will apply overlay",
                                            remainingCount,
                                            trimmedTerm);
                                    mergeTextMaps(overlayTargets, remainingForTerm);
                                } else {
                                    log.debug(
                                            "PDFium completely removed all matches for term '{}'",
                                            trimmedTerm);
                                }
                            }
                        } else {
                            log.warn(
                                    "PDFium returned no output for term '{}'; will use overlay",
                                    trimmedTerm);
                            mergeTextMaps(overlayTargets, termMatches);
                        }
                    } else {
                        mergeTextMaps(overlayTargets, termMatches);
                    }
                }
            }

            if (totalMatchesFound == 0) {
                log.debug("No text found matching any redaction patterns");
                byte[] originalContent;
                try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                    initialDocument.save(baos);
                    originalContent = baos.toByteArray();
                }

                return WebResponseUtils.bytesToWebResponse(
                        originalContent,
                        removeFileExtension(
                                        Objects.requireNonNull(
                                                Filenames.toSimpleFileName(
                                                        request.getFileInput()
                                                                .getOriginalFilename())))
                                + "_redacted.pdf");
            }

            log.info(
                    "Redaction complete: processed {} search terms, found {} total matches, PDFium applied: {}",
                    listOfText.length,
                    totalMatchesFound,
                    anyPdfiumApplied);

            // Apply overlays for any remaining text that PDFium couldn't remove
            if (!overlayTargets.isEmpty()) {
                int overlayCount = overlayTargets.values().stream().mapToInt(List::size).sum();
                log.error(
                        "Residual text remains after PDFium processing; applying PDFBox overlays to cover {} matches (example='{}')",
                        overlayCount,
                        describeResidualMatch(overlayTargets));
            }

            // Load the final document for finalization
            try (PDDocument finalDocument = pdfDocumentFactory.load(currentBytes)) {
                byte[] pdfContent =
                        finalizeRedaction(
                                finalDocument,
                                overlayTargets,
                                request.getRedactColor(),
                                request.getCustomPadding(),
                                request.getConvertPDFToImage(),
                                anyPdfiumApplied && overlayTargets.isEmpty());

                return WebResponseUtils.bytesToWebResponse(
                        pdfContent,
                        removeFileExtension(
                                        Objects.requireNonNull(
                                                Filenames.toSimpleFileName(
                                                        request.getFileInput()
                                                                .getOriginalFilename())))
                                + "_redacted.pdf");
            }

        } catch (Exception e) {
            log.error("Redaction operation failed: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to perform PDF redaction: " + e.getMessage(), e);
        }
    }

    private Map<Integer, List<PDFText>> findTextToRedact(
            PDDocument document, String[] listOfText, boolean useRegex, boolean wholeWordSearch) {
        Map<Integer, List<PDFText>> allFoundTextsByPage = new HashMap<>();

        for (String text : listOfText) {
            text = text.trim();
            if (text.isEmpty()) continue;

            log.debug(
                    "Searching for text: '{}' (regex: {}, wholeWord: {})",
                    text,
                    useRegex,
                    wholeWordSearch);

            try {
                TextFinder textFinder = new TextFinder(text, useRegex, wholeWordSearch);
                textFinder.getText(document);

                List<PDFText> foundTexts = textFinder.getFoundTexts();
                log.debug("TextFinder found {} instances of '{}'", foundTexts.size(), text);

                for (PDFText found : foundTexts) {
                    allFoundTextsByPage
                            .computeIfAbsent(found.getPageIndex(), k -> new ArrayList<>())
                            .add(found);
                    log.debug(
                            "Added match on page {} at ({},{},{},{}): '{}'",
                            found.getPageIndex(),
                            found.getX1(),
                            found.getY1(),
                            found.getX2(),
                            found.getY2(),
                            found.getText());
                }
            } catch (Exception e) {
                log.error("Error processing search term '{}': {}", text, e.getMessage());
            }
        }

        return allFoundTextsByPage;
    }

    private String[] parseListOfText(String rawText, boolean isRegexMode) {
        if (rawText == null) {
            return new String[0];
        }

        String normalized = rawText.replace("\r", "");
        boolean containsNewline = normalized.contains("\n");
        String[] newlineSplit = normalized.split("\n");
        List<String> tokens = new ArrayList<>();

        for (String candidate : newlineSplit) {
            if (!containsNewline && !isRegexMode && candidate.contains(",")) {
                for (String commaPart : candidate.split(",")) {
                    addIfPresent(tokens, commaPart);
                }
            } else {
                addIfPresent(tokens, candidate);
            }
        }

        return tokens.toArray(new String[0]);
    }

    private void addIfPresent(List<String> target, String value) {
        if (value == null) {
            return;
        }
        String trimmed = value.trim();
        if (!trimmed.isEmpty()) {
            target.add(trimmed);
        }
    }

    private Optional<byte[]> tryPdfiumTextRemoval(
            byte[] originalBytes,
            String originalFilename,
            PDDocument document,
            Map<Integer, List<PDFText>> allFoundTextsByPage,
            float customPadding,
            boolean drawBlackBoxes) {

        if (!pdfiumRedactionService.isAvailable()) {
            log.debug("PDFium service not available, skipping text removal");
            return Optional.empty();
        }

        List<PdfiumRedactionRegion> regions =
                buildPdfiumRegions(document, allFoundTextsByPage, customPadding);
        log.debug(
                "Built {} PDFium redaction regions from {} pages",
                regions.size(),
                allFoundTextsByPage.size());

        if (regions.isEmpty()) {
            log.warn("No valid PDFium regions built, skipping text removal");
            return Optional.empty();
        }

        Optional<byte[]> result =
                pdfiumRedactionService.redact(
                        originalBytes, originalFilename, regions, drawBlackBoxes);
        log.debug(
                "PDFium redaction service returned: {}", result.isPresent() ? "SUCCESS" : "EMPTY");
        return result;
    }

    private List<PdfiumRedactionRegion> buildPdfiumRegions(
            PDDocument document,
            Map<Integer, List<PDFText>> allFoundTextsByPage,
            float customPadding) {
        List<PdfiumRedactionRegion> regions = new ArrayList<>();
        PDPageTree pages = document.getDocumentCatalog().getPages();

        log.debug(
                "Building PDFium regions from {} pages (customPadding={})",
                allFoundTextsByPage.size(),
                customPadding);

        float appliedPaddingX = Math.max(customPadding, 0f);
        float appliedPaddingY = Math.max(customPadding, 0f);

        for (Map.Entry<Integer, List<PDFText>> entry : allFoundTextsByPage.entrySet()) {
            int pageIndex = entry.getKey();
            if (pageIndex < 0 || pageIndex >= pages.getCount()) {
                log.warn("Skipping invalid page index: {}", pageIndex);
                continue;
            }

            PDPage page = pages.get(pageIndex);
            PDRectangle cropBox = page.getCropBox();
            if (cropBox == null) {
                log.warn("Skipping page {} with null crop box", pageIndex);
                continue;
            }

            float minX = cropBox.getLowerLeftX();
            float minY = cropBox.getLowerLeftY();
            float maxX = cropBox.getUpperRightX();
            float maxY = cropBox.getUpperRightY();

            for (PDFText block : entry.getValue()) {
                float width = block.getX2() - block.getX1();
                float height = block.getY2() - block.getY1();
                if (width <= 0 || height <= 0) {
                    log.warn(
                            "Skipping invalid block on page {}: text='{}' width={} height={}",
                            pageIndex,
                            block.getText(),
                            width,
                            height);
                    continue;
                }

                float originX = block.getX1() - appliedPaddingX;
                float originY = block.getY1() - appliedPaddingY;

                float finalWidth = width + (appliedPaddingX * 2);
                float finalHeight = height + (appliedPaddingY * 2);

                if (originX < minX) {
                    float adjustment = minX - originX;
                    originX = minX;
                    finalWidth -= adjustment;
                }
                if (originY < minY) {
                    float adjustment = minY - originY;
                    originY = minY;
                    finalHeight -= adjustment;
                }

                float maxAllowedWidth = maxX - originX;
                if (finalWidth > maxAllowedWidth) {
                    finalWidth = maxAllowedWidth;
                }
                float maxAllowedHeight = maxY - originY;
                if (finalHeight > maxAllowedHeight) {
                    finalHeight = maxAllowedHeight;
                }

                if (finalWidth <= 0 || finalHeight <= 0) {
                    log.debug(
                            "Discarding clamped region on page {} for text='{}' after bounds adjustment",
                            pageIndex,
                            block.getText());
                    continue;
                }

                PdfiumRedactionRegion region =
                        new PdfiumRedactionRegion(
                                pageIndex, originX, originY, finalWidth, finalHeight);
                regions.add(region);
                log.debug(
                        "Created PDFium region #{}: page={} text='{}' origin=({},{}) size=({},{})",
                        regions.size(),
                        pageIndex,
                        block.getText(),
                        originX,
                        originY,
                        finalWidth,
                        finalHeight);
            }
        }

        return regions;
    }

    private String describeResidualMatch(Map<Integer, List<PDFText>> textsByPage) {
        return textsByPage.entrySet().stream()
                .flatMap(
                        entry ->
                                entry.getValue().stream()
                                        .map(
                                                block -> {
                                                    String text = block.getText();
                                                    if (text != null && text.length() > 40) {
                                                        text = text.substring(0, 40) + "...";
                                                    }
                                                    int page =
                                                            entry.getKey() != null
                                                                    ? entry.getKey() + 1
                                                                    : -1;
                                                    return (text != null ? text : "(null)")
                                                            + " (page "
                                                            + page
                                                            + ")";
                                                }))
                .findFirst()
                .orElse("n/a");
    }

    private void mergeTextMaps(
            Map<Integer, List<PDFText>> target, Map<Integer, List<PDFText>> additions) {
        for (Map.Entry<Integer, List<PDFText>> entry : additions.entrySet()) {
            target.computeIfAbsent(entry.getKey(), k -> new ArrayList<>()).addAll(entry.getValue());
        }
    }

    private boolean ensurePdfiumAvailability() {
        if (!pdfiumRedactionService.isAvailable()) {
            log.warn(
                    "PDFium text removal service is unavailable; falling back to overlay-only mode");
            return false;
        }
        return true;
    }

    private byte[] finalizeRedaction(
            PDDocument document,
            Map<Integer, List<PDFText>> allFoundTextsByPage,
            String colorString,
            float customPadding,
            Boolean convertToImage,
            boolean isTextRemovalMode)
            throws IOException {

        List<PDFText> allFoundTexts = new ArrayList<>();
        for (List<PDFText> pageTexts : allFoundTextsByPage.values()) {
            allFoundTexts.addAll(pageTexts);
        }

        log.debug(
                "Finalizing redaction: {} text blocks, textRemovalMode={}, convertToImage={}, color={}",
                allFoundTexts.size(),
                isTextRemovalMode,
                convertToImage,
                colorString);

        if (!allFoundTexts.isEmpty()) {
            Color redactColor = decodeOrDefault(colorString);

            redactFoundText(document, allFoundTexts, customPadding, redactColor, isTextRemovalMode);
        } else {
            log.warn("No text blocks to redact in finalization");
        }

        cleanDocumentMetadata(document);

        if (Boolean.TRUE.equals(convertToImage)) {
            try (PDDocument convertedPdf = PdfUtils.convertPdfToPdfImage(document)) {
                cleanDocumentMetadata(convertedPdf);

                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                convertedPdf.save(baos);
                byte[] out = baos.toByteArray();

                return out;
            }
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        byte[] out = baos.toByteArray();

        return out;
    }

    private void cleanDocumentMetadata(PDDocument document) {
        try {
            var documentInfo = document.getDocumentInformation();
            if (documentInfo != null) {
                documentInfo.setAuthor(null);
                documentInfo.setSubject(null);
                documentInfo.setKeywords(null);

                documentInfo.setModificationDate(java.util.Calendar.getInstance());

                log.debug("Cleaned document metadata for security");
            }

            if (document.getDocumentCatalog() != null) {
                try {
                    document.getDocumentCatalog().setMetadata(null);
                } catch (Exception e) {
                    log.debug("Could not clear XMP metadata: {}", e.getMessage());
                }
            }

        } catch (Exception e) {
            log.warn("Failed to clean document metadata: {}", e.getMessage());
        }
    }
}
