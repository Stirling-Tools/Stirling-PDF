package stirling.software.SPDF.controller.api.security;

import java.awt.Color;
import java.awt.geom.Point2D;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.apache.pdfbox.contentstream.PDFGraphicsStreamEngine;
import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSFloat;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSNumber;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdfwriter.ContentStreamWriter;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImage;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.apache.pdfbox.util.Matrix;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.PDFText;
import stirling.software.SPDF.model.api.security.ManualRedactPdfRequest;
import stirling.software.SPDF.model.api.security.RedactExecuteRequest;
import stirling.software.SPDF.model.api.security.RedactPdfRequest;
import stirling.software.SPDF.pdf.TextFinder;
import stirling.software.SPDF.utils.text.TextEncodingHelper;
import stirling.software.SPDF.utils.text.TextFinderUtils;
import stirling.software.SPDF.utils.text.WidthCalculator;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.SecurityApi;
import stirling.software.common.model.api.security.RedactionArea;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.PdfUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.common.util.propertyeditor.StringToArrayListPropertyEditor;

@SecurityApi
@Slf4j
@RequiredArgsConstructor
public class RedactController {

    private static final float DEFAULT_TEXT_PADDING_MULTIPLIER = 0.6f;
    private static final float PRECISION_THRESHOLD = 1e-3f;
    private static final int FONT_SCALE_FACTOR = 1000;

    // Redaction box width reduction factor (10% reduction)
    private static final float REDACTION_WIDTH_REDUCTION_FACTOR = 0.9f;

    // Text showing operators
    private static final Set<String> TEXT_SHOWING_OPERATORS = Set.of("Tj", "TJ", "'", "\"");

    private static final COSString EMPTY_COS_STRING = new COSString("");

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

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
    public ResponseEntity<StreamingResponseBody> redactPDF(
            @ModelAttribute ManualRedactPdfRequest request) throws IOException {

        MultipartFile file = request.getFileInput();
        List<RedactionArea> redactionAreas = request.getRedactions();

        try (PDDocument document = pdfDocumentFactory.load(file)) {
            PDPageTree allPages = document.getDocumentCatalog().getPages();

            redactPages(request, document, allPages);

            redactAreas(redactionAreas, document, allPages);

            if (Boolean.TRUE.equals(request.getConvertPDFToImage())) {
                try (PDDocument convertedPdf = PdfUtils.convertPdfToPdfImage(document)) {
                    return WebResponseUtils.pdfDocToWebResponse(
                            convertedPdf,
                            removeFileExtension(
                                            Objects.requireNonNull(
                                                    Filenames.toSimpleFileName(
                                                            file.getOriginalFilename())))
                                    + "_redacted.pdf",
                            tempFileManager);
                }
            }

            return WebResponseUtils.pdfDocToWebResponse(
                    document,
                    removeFileExtension(
                                    Objects.requireNonNull(
                                            Filenames.toSimpleFileName(file.getOriginalFilename())))
                            + "_redacted.pdf",
                    tempFileManager);
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

        var allPages = document.getDocumentCatalog().getPages();

        Map<Integer, List<PDFText>> blocksByPage = new HashMap<>();
        for (PDFText block : blocks) {
            blocksByPage.computeIfAbsent(block.getPageIndex(), k -> new ArrayList<>()).add(block);
        }

        for (Map.Entry<Integer, List<PDFText>> entry : blocksByPage.entrySet()) {
            Integer pageIndex = entry.getKey();
            List<PDFText> pageBlocks = entry.getValue();

            if (pageIndex >= allPages.getCount()) {
                continue; // Skip if page index is out of bounds
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

            // Remove any annotations (links, URI actions, etc.) whose bounding rect
            // overlaps a redacted block. This prevents users from hovering over
            // redacted URLs in a viewer and seeing the underlying destination.
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
                            // Convert screen-space block coords to PDF user-space
                            float bx1 = block.getX1();
                            float bx2 = block.getX2();
                            float by1 = pageH - block.getY2() - padding; // PDF bottom
                            float by2 = pageH - block.getY1() + padding; // PDF top
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

    String createPlaceholderWithFont(String originalWord, PDFont font) {
        if (originalWord == null || originalWord.isEmpty()) {
            return originalWord;
        }

        if (font != null && TextEncodingHelper.isFontSubset(font.getName())) {
            try {
                float originalWidth = safeGetStringWidth(font, originalWord) / FONT_SCALE_FACTOR;
                return createAlternativePlaceholder(originalWord, originalWidth, font, 1.0f);
            } catch (Exception e) {
                log.debug(
                        "Subset font placeholder creation failed for {}: {}",
                        font.getName(),
                        e.getMessage());
                return "";
            }
        }

        return " ".repeat(originalWord.length());
    }

    /**
     * Enhanced placeholder creation using advanced width calculation. Incorporates font validation
     * and sophisticated fallback strategies.
     */
    String createPlaceholderWithWidth(
            String originalWord, float targetWidth, PDFont font, float fontSize) {
        if (originalWord == null || originalWord.isEmpty()) {
            return originalWord;
        }

        if (font == null || fontSize <= 0) {
            return " ".repeat(originalWord.length());
        }

        try {
            // Check font reliability before proceeding
            if (!WidthCalculator.isWidthCalculationReliable(font)) {
                log.debug(
                        "Font {} unreliable for width calculation, using simple placeholder",
                        font.getName());
                return " ".repeat(originalWord.length());
            }

            // Use enhanced subset font detection
            if (TextEncodingHelper.isFontSubset(font.getName())) {
                return createSubsetFontPlaceholder(originalWord, targetWidth, font, fontSize);
            }

            // Enhanced space width calculation
            float spaceWidth = WidthCalculator.calculateAccurateWidth(font, " ", fontSize);

            if (spaceWidth <= 0) {
                return createAlternativePlaceholder(originalWord, targetWidth, font, fontSize);
            }

            int spaceCount = Math.max(1, Math.round(targetWidth / spaceWidth));

            // More conservative space limit based on original word characteristics
            int maxSpaces =
                    Math.max(
                            originalWord.length() * 2, Math.round(targetWidth / spaceWidth * 1.5f));
            spaceCount = Math.min(spaceCount, maxSpaces);

            return " ".repeat(spaceCount);

        } catch (Exception e) {
            log.debug("Enhanced placeholder creation failed: {}", e.getMessage());
            return createAlternativePlaceholder(originalWord, targetWidth, font, fontSize);
        }
    }

    private String createSubsetFontPlaceholder(
            String originalWord, float targetWidth, PDFont font, float fontSize) {
        try {
            log.debug("Subset font {} - trying to find replacement characters", font.getName());
            String result = createAlternativePlaceholder(originalWord, targetWidth, font, fontSize);

            if (result.isEmpty()) {
                log.debug(
                        "Subset font {} has no suitable replacement characters, using empty string",
                        font.getName());
            }

            return result;

        } catch (Exception e) {
            log.debug("Subset font placeholder creation failed: {}", e.getMessage());
            return "";
        }
    }

    private String createAlternativePlaceholder(
            String originalWord, float targetWidth, PDFont font, float fontSize) {
        try {
            String[] alternatives = {" ", ".", "-", "_", "~", "°", "·"};

            if (TextEncodingHelper.fontSupportsCharacter(font, " ")) {
                float spaceWidth = safeGetStringWidth(font, " ") / FONT_SCALE_FACTOR * fontSize;
                if (spaceWidth > 0) {
                    int spaceCount = Math.max(1, Math.round(targetWidth / spaceWidth));
                    int maxSpaces = originalWord.length() * 2;
                    spaceCount = Math.min(spaceCount, maxSpaces);
                    log.debug("Using spaces for font {}", font.getName());
                    return " ".repeat(spaceCount);
                }
            }

            for (String altChar : alternatives) {
                if (" ".equals(altChar)) continue; // Already tried spaces

                try {
                    if (!TextEncodingHelper.fontSupportsCharacter(font, altChar)) {
                        continue;
                    }

                    float charWidth =
                            safeGetStringWidth(font, altChar) / FONT_SCALE_FACTOR * fontSize;
                    if (charWidth > 0) {
                        int charCount = Math.max(1, Math.round(targetWidth / charWidth));
                        int maxChars = originalWord.length() * 2;
                        charCount = Math.min(charCount, maxChars);
                        log.debug(
                                "Using character '{}' for width calculation but spaces for placeholder in font {}",
                                altChar,
                                font.getName());

                        return " ".repeat(charCount);
                    }
                } catch (Exception e) {
                }
            }

            log.debug(
                    "All placeholder alternatives failed for font {}, using empty string",
                    font.getName());
            return "";

        } catch (Exception e) {
            log.debug("Alternative placeholder creation failed: {}", e.getMessage());
            return "";
        }
    }

    void writeFilteredContentStream(PDDocument document, PDPage page, List<Object> tokens)
            throws IOException {

        PDStream newStream = new PDStream(document);

        try {
            try (var out = newStream.createOutputStream()) {
                ContentStreamWriter writer = new ContentStreamWriter(out);
                writer.writeTokens(tokens);
            }

            page.setContents(newStream);

        } catch (IOException e) {
            throw new IOException("Failed to write filtered content stream to page", e);
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

    boolean isTextShowingOperator(String opName) {
        return TEXT_SHOWING_OPERATORS.contains(opName);
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
    public ResponseEntity<StreamingResponseBody> redactPdf(
            @ModelAttribute RedactPdfRequest request) {
        String[] listOfText = request.getListOfText().split("\n");
        boolean useRegex = Boolean.TRUE.equals(request.getUseRegex());
        boolean wholeWordSearchBool = Boolean.TRUE.equals(request.getWholeWordSearch());

        if (listOfText.length == 0 || (listOfText.length == 1 && listOfText[0].trim().isEmpty())) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.redaction.no.patterns", "No text patterns provided for redaction");
        }

        PDDocument document = null;
        PDDocument fallbackDocument = null;

        try {
            if (request.getFileInput() == null) {
                log.error("File input is null");
                throw ExceptionUtils.createFileNullOrEmptyException();
            }

            document = pdfDocumentFactory.load(request.getFileInput());

            if (document == null) {
                log.error("Failed to load PDF document");
                throw ExceptionUtils.createPdfCorruptedException(
                        "during redaction", new IOException("Failed to load PDF document"));
            }

            Map<Integer, List<PDFText>> allFoundTextsByPage =
                    findTextToRedact(document, listOfText, useRegex, wholeWordSearchBool);

            int totalMatches = allFoundTextsByPage.values().stream().mapToInt(List::size).sum();
            log.info(
                    "Redaction scan: {} occurrences across {} pages (patterns={}, regex={}, wholeWord={})",
                    totalMatches,
                    allFoundTextsByPage.size(),
                    listOfText.length,
                    useRegex,
                    wholeWordSearchBool);

            if (allFoundTextsByPage.isEmpty()) {
                log.info("No text found matching redaction patterns");
                return WebResponseUtils.pdfDocToWebResponse(
                        document,
                        removeFileExtension(
                                        Objects.requireNonNull(
                                                Filenames.toSimpleFileName(
                                                        request.getFileInput()
                                                                .getOriginalFilename())))
                                + "_redacted.pdf",
                        tempFileManager);
            }

            boolean fallbackToBoxOnlyMode;
            try {
                fallbackToBoxOnlyMode =
                        performTextReplacement(
                                document,
                                allFoundTextsByPage,
                                listOfText,
                                useRegex,
                                wholeWordSearchBool);
            } catch (Exception e) {
                log.warn(
                        "Text replacement redaction failed, falling back to box-only mode: {}",
                        e.getMessage());
                fallbackToBoxOnlyMode = true;
            }

            if (fallbackToBoxOnlyMode) {
                log.warn(
                        "Font compatibility issues detected. Using box-only redaction mode for better reliability.");

                fallbackDocument = pdfDocumentFactory.load(request.getFileInput());

                allFoundTextsByPage =
                        findTextToRedact(
                                fallbackDocument, listOfText, useRegex, wholeWordSearchBool);

                TempFile finalized =
                        finalizeRedaction(
                                fallbackDocument,
                                allFoundTextsByPage,
                                request.getRedactColor(),
                                request.getCustomPadding(),
                                request.getConvertPDFToImage(),
                                false); // Box-only mode, use original box sizes

                return WebResponseUtils.pdfFileToWebResponse(
                        finalized,
                        removeFileExtension(
                                        Objects.requireNonNull(
                                                Filenames.toSimpleFileName(
                                                        request.getFileInput()
                                                                .getOriginalFilename())))
                                + "_redacted.pdf");
            }

            TempFile finalized =
                    finalizeRedaction(
                            document,
                            allFoundTextsByPage,
                            request.getRedactColor(),
                            request.getCustomPadding(),
                            request.getConvertPDFToImage(),
                            true); // Text removal mode, use reduced box sizes

            return WebResponseUtils.pdfFileToWebResponse(
                    finalized,
                    removeFileExtension(
                                    Objects.requireNonNull(
                                            Filenames.toSimpleFileName(
                                                    request.getFileInput().getOriginalFilename())))
                            + "_redacted.pdf");

        } catch (Exception e) {
            log.error("Redaction operation failed: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to perform PDF redaction: " + e.getMessage(), e);

        } finally {
            if (document != null) {
                try {
                    if (fallbackDocument == null) {
                        document.close();
                    }
                } catch (IOException e) {
                    log.warn("Failed to close main document: {}", e.getMessage());
                }
            }

            if (fallbackDocument != null) {
                try {
                    fallbackDocument.close();
                } catch (IOException e) {
                    log.warn("Failed to close fallback document: {}", e.getMessage());
                }
            }
        }
    }

    @AutoJobPostMapping(value = "/redact/execute", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @StandardPdfResponse
    @Operation(
            operationId = "executeRedaction",
            summary = "Execute a unified redaction plan on a PDF",
            description =
                    "Unified redaction endpoint that accepts exact strings, regex patterns, and "
                            + "page numbers in a single request. Supports execution strategy hints. "
                            + "Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<StreamingResponseBody> executeRedaction(
            @ModelAttribute RedactExecuteRequest request) throws IOException {

        boolean hasTexts =
                request.getTextsToRedact() != null && !request.getTextsToRedact().isBlank();
        boolean hasRegex =
                request.getRegexPatterns() != null && !request.getRegexPatterns().isBlank();
        boolean hasPages = request.getPageNumbers() != null && !request.getPageNumbers().isBlank();
        boolean hasImageBoxes =
                request.getImageBoxes() != null && !request.getImageBoxes().isBlank();
        boolean hasTextRanges =
                request.getTextRanges() != null && !request.getTextRanges().isEmpty();
        boolean hasRedactAllImages = Boolean.TRUE.equals(request.getRedactAllImages());

        if (!hasTexts
                && !hasRegex
                && !hasPages
                && !hasImageBoxes
                && !hasTextRanges
                && !hasRedactAllImages) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.redaction.no.targets", "No redaction targets provided");
        }

        String[] exactTerms =
                hasTexts
                        ? Arrays.stream(request.getTextsToRedact().split("\n"))
                                .map(String::trim)
                                .filter(s -> !s.isEmpty())
                                .toArray(String[]::new)
                        : new String[0];
        String[] regexTerms =
                hasRegex
                        ? Arrays.stream(request.getRegexPatterns().split("\n"))
                                .map(String::trim)
                                .filter(s -> !s.isEmpty())
                                .toArray(String[]::new)
                        : new String[0];

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
                findTextToRedact(document, exactTerms, false, false)
                        .forEach(
                                (page, hits) ->
                                        foundTexts
                                                .computeIfAbsent(page, k -> new ArrayList<>())
                                                .addAll(hits));
            }
            if (regexTerms.length > 0) {
                findTextToRedact(document, regexTerms, true, false)
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
                                findTextToRedact(document, exactTerms, false, false);
                        if (!exactFound.isEmpty()) {
                            fallback =
                                    performTextReplacement(
                                            document, exactFound, exactTerms, false, false);
                        }
                    }
                    if (!fallback && regexTerms.length > 0) {
                        Map<Integer, List<PDFText>> regexFound =
                                findTextToRedact(document, regexTerms, true, false);
                        if (!regexFound.isEmpty()) {
                            fallback |=
                                    performTextReplacement(
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
                    findTextToRedact(document, exactTerms, false, false)
                            .forEach(
                                    (page, hits) ->
                                            foundTexts
                                                    .computeIfAbsent(page, k -> new ArrayList<>())
                                                    .addAll(hits));
                }
                if (regexTerms.length > 0) {
                    findTextToRedact(document, regexTerms, true, false)
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
                Color pageColor = decodeOrDefault(request.getRedactColor());
                List<Integer> pageIndices =
                        GeneralUtils.parsePageList(
                                request.getPageNumbers().split(","), allPages.getCount(), false);
                Collections.sort(pageIndices);
                log.info(
                        "[redact/execute] full-page wipe: {} pages ({})",
                        pageIndices.size(),
                        request.getPageNumbers());

                // Pre-extract element bounding boxes before removing page content so we can
                // draw individual redaction boxes (text lines + images) instead of a solid fill.
                Map<Integer, List<float[]>> pageElementBoxes = new HashMap<>();
                for (Integer idx : pageIndices) {
                    if (idx >= 0 && idx < allPages.getCount()) {
                        try {
                            pageElementBoxes.put(
                                    idx, extractPageElementBoxes(document, allPages.get(idx), idx));
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
                                // Fallback: solid fill when no elements could be detected
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
                List<String> rawRanges = request.getTextRanges();
                if (rawRanges.size() % 2 != 0) {
                    log.warn(
                            "[redact/execute] textRanges has odd element count ({}); expected"
                                    + " start/end pairs — last element ignored",
                            rawRanges.size());
                }
                log.info("[redact/execute] {} text ranges to redact", rawRanges.size() / 2);
                for (int ri = 0; ri + 1 < rawRanges.size(); ri += 2) {
                    String rangeStart = rawRanges.get(ri).trim();
                    String rangeEnd = rawRanges.get(ri + 1).trim();
                    try {
                        List<PDFText> blocks = collectRangeBlocks(document, rangeStart, rangeEnd);
                        if (!blocks.isEmpty()) {
                            redactFoundText(
                                    document,
                                    blocks,
                                    request.getCustomPadding(),
                                    decodeOrDefault(request.getRedactColor()),
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
                List<float[]> parsedImageBoxes = parseImageBoxes(request.getImageBoxes());
                log.info("[redact/execute] {} image box overlays", parsedImageBoxes.size());
                if (!parsedImageBoxes.isEmpty()) {
                    Color boxColor = decodeOrDefault(request.getRedactColor());
                    redactImageBoxes(document, parsedImageBoxes, boxColor);
                }
            }

            // --- Auto image detection (redact all images on specified pages) ---
            if (hasRedactAllImages) {
                PDPageTree allPages = document.getDocumentCatalog().getPages();
                Color imgColor = decodeOrDefault(request.getRedactColor());

                // Determine which page indices to scan (1-based imagePages → 0-based indices).
                List<Integer> imagePageIndices = new ArrayList<>();
                if (request.getImagePages() != null && !request.getImagePages().isBlank()) {
                    List<Integer> parsed =
                            GeneralUtils.parsePageList(
                                    request.getImagePages().split(","), allPages.getCount(), false);
                    imagePageIndices.addAll(parsed);
                } else {
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
                    redactImageBoxes(document, detectedBoxes, imgColor);
                }
            }

            // --- Finalize: overlay text boxes + optional image conversion + save ---
            String filename =
                    removeFileExtension(
                                    Objects.requireNonNull(
                                            Filenames.toSimpleFileName(
                                                    request.getFileInput().getOriginalFilename())))
                            + "_redacted.pdf";
            TempFile out =
                    finalizeRedaction(
                            document,
                            foundTexts,
                            request.getRedactColor(),
                            request.getCustomPadding(),
                            convertToImage,
                            !needsOverlayOnly);
            return WebResponseUtils.pdfFileToWebResponse(out, filename);

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

    private boolean performTextReplacement(
            PDDocument document,
            Map<Integer, List<PDFText>> allFoundTextsByPage,
            String[] listOfText,
            boolean useRegex,
            boolean wholeWordSearchBool) {
        if (allFoundTextsByPage.isEmpty()) {
            return false;
        }

        if (detectCustomEncodingFonts(document)) {
            log.warn(
                    "Custom encoded fonts detected (non-standard encodings / DictionaryEncoding / damaged fonts). "
                            + "Text replacement is unreliable for these fonts. Falling back to box-only redaction mode.");
            return true; // signal caller to fall back
        }

        try {
            Set<String> allSearchTerms =
                    Arrays.stream(listOfText)
                            .map(String::trim)
                            .filter(s -> !s.isEmpty())
                            .collect(Collectors.toSet());

            int pageCount = 0;
            for (PDPage page : document.getPages()) {
                pageCount++;
                List<Object> filteredTokens =
                        createTokensWithoutTargetText(
                                document, page, allSearchTerms, useRegex, wholeWordSearchBool);
                writeFilteredContentStream(document, page, filteredTokens);
            }
            log.info("Successfully performed text replacement redaction on {} pages.", pageCount);
            return false;
        } catch (Exception e) {
            log.error(
                    "Text replacement redaction failed due to font or encoding issues. "
                            + "Will fall back to box-only redaction mode. Error: {}",
                    e.getMessage());
            return true;
        }
    }

    private TempFile finalizeRedaction(
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

        if (!allFoundTexts.isEmpty()) {
            Color redactColor = decodeOrDefault(colorString);

            redactFoundText(document, allFoundTexts, customPadding, redactColor, isTextRemovalMode);

            cleanDocumentMetadata(document);
        }

        if (Boolean.TRUE.equals(convertToImage)) {
            try (PDDocument convertedPdf = PdfUtils.convertPdfToPdfImage(document)) {
                cleanDocumentMetadata(convertedPdf);

                TempFile tempOut = tempFileManager.createManagedTempFile(".pdf");
                try {
                    convertedPdf.save(tempOut.getFile());
                } catch (IOException e) {
                    tempOut.close();
                    throw e;
                }

                log.info(
                        "Redaction finalized (image mode): {} pages ➜ {} KB",
                        convertedPdf.getNumberOfPages(),
                        tempOut.getFile().length() / 1024);

                return tempOut;
            }
        }

        TempFile tempOut = tempFileManager.createManagedTempFile(".pdf");
        try {
            document.save(tempOut.getFile());
        } catch (IOException e) {
            tempOut.close();
            throw e;
        }

        log.info(
                "Redaction finalized: {} pages ➜ {} KB",
                document.getNumberOfPages(),
                tempOut.getFile().length() / 1024);

        return tempOut;
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

    List<Object> createTokensWithoutTargetText(
            PDDocument document,
            PDPage page,
            Set<String> targetWords,
            boolean useRegex,
            boolean wholeWordSearch)
            throws IOException {

        PDFStreamParser parser = new PDFStreamParser(page);
        List<Object> tokens = new ArrayList<>();
        Object token;
        while ((token = parser.parseNextToken()) != null) {
            tokens.add(token);
        }

        PDResources resources = page.getResources();
        if (resources != null) {
            processPageXObjects(document, resources, targetWords, useRegex, wholeWordSearch);
        }

        List<TextSegment> textSegments = extractTextSegments(page, tokens);

        String completeText = buildCompleteText(textSegments);

        List<MatchRange> matches =
                findAllMatches(completeText, targetWords, useRegex, wholeWordSearch);

        return applyRedactionsToTokens(tokens, textSegments, matches);
    }

    private void processPageXObjects(
            PDDocument document,
            PDResources resources,
            Set<String> targetWords,
            boolean useRegex,
            boolean wholeWordSearch) {

        for (COSName xobjName : resources.getXObjectNames()) {
            try {
                PDXObject xobj = resources.getXObject(xobjName);
                if (xobj instanceof PDFormXObject formXObj) {
                    processFormXObject(document, formXObj, targetWords, useRegex, wholeWordSearch);
                    log.debug("Processed Form XObject: {}", xobjName.getName());
                }
            } catch (Exception e) {
                log.warn("Failed to process XObject {}: {}", xobjName.getName(), e.getMessage());
            }
        }
    }

    @Data
    private static class GraphicsState {
        private PDFont font = null;
        private float fontSize = 0;
    }

    @Data
    @AllArgsConstructor
    private static class TextSegment {
        private int tokenIndex;
        private String operatorName;
        private String text;
        private int startPos;
        private int endPos;
        private PDFont font;
        private float fontSize;
    }

    @Data
    @AllArgsConstructor
    private static class MatchRange {
        private int startPos;
        private int endPos;
    }

    private List<TextSegment> extractTextSegments(PDPage page, List<Object> tokens) {

        List<TextSegment> segments = new ArrayList<>();
        int currentTextPos = 0;
        GraphicsState graphicsState = new GraphicsState();
        PDResources resources = page.getResources();

        for (int i = 0; i < tokens.size(); i++) {
            Object currentToken = tokens.get(i);

            if (currentToken instanceof Operator op) {
                String opName = op.getName();

                if ("Tf".equals(opName) && i >= 2) {
                    try {
                        COSName fontName = (COSName) tokens.get(i - 2);
                        COSBase fontSizeBase = (COSBase) tokens.get(i - 1);
                        if (fontSizeBase instanceof COSNumber cosNumber) {
                            graphicsState.setFont(resources.getFont(fontName));
                            graphicsState.setFontSize(cosNumber.floatValue());
                        }
                    } catch (ClassCastException | IOException e) {
                        log.debug(
                                "Failed to extract font and font size from Tf operator: {}",
                                e.getMessage());
                    }
                }

                currentTextPos =
                        getCurrentTextPos(
                                tokens, segments, currentTextPos, graphicsState, i, opName);
            }
        }

        return segments;
    }

    private String buildCompleteText(List<TextSegment> segments) {
        StringBuilder sb = new StringBuilder();
        for (TextSegment segment : segments) {
            sb.append(segment.text);
        }
        return sb.toString();
    }

    private List<MatchRange> findAllMatches(
            String completeText,
            Set<String> targetWords,
            boolean useRegex,
            boolean wholeWordSearch) {

        // Use the new utility for creating optimized patterns
        List<Pattern> patterns =
                TextFinderUtils.createOptimizedSearchPatterns(
                        targetWords, useRegex, wholeWordSearch);

        return patterns.stream()
                .flatMap(
                        pattern -> {
                            try {
                                return pattern.matcher(completeText).results();
                            } catch (Exception e) {
                                log.debug(
                                        "Pattern matching failed for pattern {}: {}",
                                        pattern.pattern(),
                                        e.getMessage());
                                return java.util.stream.Stream.empty();
                            }
                        })
                .map(matchResult -> new MatchRange(matchResult.start(), matchResult.end()))
                .sorted(Comparator.comparingInt(MatchRange::getStartPos))
                .collect(Collectors.toList());
    }

    private List<Object> applyRedactionsToTokens(
            List<Object> tokens, List<TextSegment> textSegments, List<MatchRange> matches) {

        long startTime = System.currentTimeMillis();

        try {
            List<Object> newTokens = new ArrayList<>(tokens);

            Map<Integer, List<MatchRange>> matchesBySegment = new HashMap<>();
            for (MatchRange match : matches) {
                for (int i = 0; i < textSegments.size(); i++) {
                    TextSegment segment = textSegments.get(i);
                    int overlapStart = Math.max(match.startPos, segment.startPos);
                    int overlapEnd = Math.min(match.endPos, segment.endPos);
                    if (overlapStart < overlapEnd) {
                        matchesBySegment.computeIfAbsent(i, k -> new ArrayList<>()).add(match);
                    }
                }
            }

            List<ModificationTask> tasks = new ArrayList<>();
            for (Map.Entry<Integer, List<MatchRange>> entry : matchesBySegment.entrySet()) {
                int segmentIndex = entry.getKey();
                List<MatchRange> segmentMatches = entry.getValue();
                TextSegment segment = textSegments.get(segmentIndex);

                if ("Tj".equals(segment.operatorName) || "'".equals(segment.operatorName)) {
                    String newText = applyRedactionsToSegmentText(segment, segmentMatches);
                    try {
                        float adjustment = calculateWidthAdjustment(segment, segmentMatches);
                        tasks.add(new ModificationTask(segment, newText, adjustment));
                    } catch (Exception e) {
                        log.debug(
                                "Width adjustment calculation failed for segment: {}",
                                e.getMessage());
                    }
                } else if ("TJ".equals(segment.operatorName)) {
                    tasks.add(new ModificationTask(segment, null, 0));
                }
            }

            tasks.sort((a, b) -> Integer.compare(b.segment.tokenIndex, a.segment.tokenIndex));

            for (ModificationTask task : tasks) {
                List<MatchRange> segmentMatches =
                        matchesBySegment.getOrDefault(
                                textSegments.indexOf(task.segment), Collections.emptyList());
                modifyTokenForRedaction(
                        newTokens, task.segment, task.newText, task.adjustment, segmentMatches);
            }

            return newTokens;

        } finally {
            long processingTime = System.currentTimeMillis() - startTime;
            log.debug(
                    "Token redaction processing completed in {} ms for {} matches",
                    processingTime,
                    matches.size());
        }
    }

    @Data
    @AllArgsConstructor
    private static class ModificationTask {
        private TextSegment segment;
        private String newText; // Only for Tj
        private float adjustment; // Only for Tj
    }

    private String applyRedactionsToSegmentText(TextSegment segment, List<MatchRange> matches) {
        String text = segment.getText();

        if (segment.getFont() != null
                && !TextEncodingHelper.isTextSegmentRemovable(segment.getFont(), text)) {
            log.debug(
                    "Skipping text segment '{}' - font {} cannot process this text reliably",
                    text,
                    segment.getFont().getName());
            return text; // Return original text unchanged
        }

        StringBuilder result = new StringBuilder(text);

        for (MatchRange match : matches) {
            int segmentStart = Math.max(0, match.getStartPos() - segment.getStartPos());
            int segmentEnd = Math.min(text.length(), match.getEndPos() - segment.getStartPos());

            if (segmentStart < text.length() && segmentEnd > segmentStart) {
                String originalPart = text.substring(segmentStart, segmentEnd);

                if (segment.getFont() != null
                        && !TextEncodingHelper.isTextSegmentRemovable(
                                segment.getFont(), originalPart)) {
                    log.debug(
                            "Skipping text part '{}' within segment - cannot be processed reliably",
                            originalPart);
                    continue; // Skip this match, process others
                }

                float originalWidth = 0;
                if (segment.getFont() != null && segment.getFontSize() > 0) {
                    try {
                        originalWidth =
                                safeGetStringWidth(segment.getFont(), originalPart)
                                        / FONT_SCALE_FACTOR
                                        * segment.getFontSize();
                    } catch (Exception e) {
                        log.debug(
                                "Failed to calculate original width for placeholder: {}",
                                e.getMessage());
                    }
                }

                String placeholder =
                        (originalWidth > 0)
                                ? createPlaceholderWithWidth(
                                        originalPart,
                                        originalWidth,
                                        segment.getFont(),
                                        segment.getFontSize())
                                : createPlaceholderWithFont(originalPart, segment.getFont());

                result.replace(segmentStart, segmentEnd, placeholder);
            }
        }

        return result.toString();
    }

    private float safeGetStringWidth(PDFont font, String text) {
        if (font == null || text == null || text.isEmpty()) {
            return 0;
        }

        if (!WidthCalculator.isWidthCalculationReliable(font)) {
            log.debug(
                    "Font {} flagged as unreliable for width calculation, using fallback",
                    font.getName());
            return calculateConservativeWidth(font, text);
        }

        if (!TextEncodingHelper.canEncodeCharacters(font, text)) {
            log.debug(
                    "Text cannot be encoded by font {}, using character-based fallback",
                    font.getName());
            return calculateCharacterBasedWidth(font, text);
        }

        try {
            float width = font.getStringWidth(text);
            log.debug("Direct width calculation successful for '{}': {}", text, width);
            return width;

        } catch (Exception e) {
            log.debug(
                    "Direct width calculation failed for font {}: {}",
                    font.getName(),
                    e.getMessage());
            return calculateFallbackWidth(font, text);
        }
    }

    private float calculateCharacterBasedWidth(PDFont font, String text) {
        try {
            float totalWidth = 0;
            for (int i = 0; i < text.length(); i++) {
                String character = text.substring(i, i + 1);
                try {
                    // Validate character encoding first
                    if (!TextEncodingHelper.fontSupportsCharacter(font, character)) {
                        totalWidth += font.getAverageFontWidth();
                        continue;
                    }

                    byte[] encoded = font.encode(character);
                    if (encoded.length > 0) {
                        int glyphCode = encoded[0] & 0xFF;
                        float glyphWidth = font.getWidth(glyphCode);

                        // Try alternative width methods if primary fails
                        if (glyphWidth == 0) {
                            try {
                                glyphWidth = font.getWidthFromFont(glyphCode);
                            } catch (Exception e2) {
                                glyphWidth = font.getAverageFontWidth();
                            }
                        }

                        totalWidth += glyphWidth;
                    } else {
                        totalWidth += font.getAverageFontWidth();
                    }
                } catch (Exception e2) {
                    // Character processing failed, use average width
                    totalWidth += font.getAverageFontWidth();
                }
            }

            log.debug("Character-based width calculation: {}", totalWidth);
            return totalWidth;

        } catch (Exception e) {
            log.debug("Character-based width calculation failed: {}", e.getMessage());
            return calculateConservativeWidth(font, text);
        }
    }

    private float calculateFallbackWidth(PDFont font, String text) {
        try {
            // Method 1: Font bounding box approach
            if (font.getFontDescriptor() != null
                    && font.getFontDescriptor().getFontBoundingBox() != null) {

                PDRectangle bbox = font.getFontDescriptor().getFontBoundingBox();
                float avgCharWidth = bbox.getWidth() * 0.6f; // Conservative estimate
                float fallbackWidth = text.length() * avgCharWidth;

                log.debug("Bounding box fallback width: {}", fallbackWidth);
                return fallbackWidth;
            }

            // Method 2: Average font width
            try {
                float avgWidth = font.getAverageFontWidth();
                if (avgWidth > 0) {
                    float fallbackWidth = text.length() * avgWidth;
                    log.debug("Average width fallback: {}", fallbackWidth);
                    return fallbackWidth;
                }
            } catch (Exception e2) {
                log.debug("Average font width calculation failed: {}", e2.getMessage());
            }

            // Method 3: Conservative estimate based on font metrics
            return calculateConservativeWidth(font, text);

        } catch (Exception e) {
            log.debug("Fallback width calculation failed: {}", e.getMessage());
            return calculateConservativeWidth(font, text);
        }
    }

    private float calculateConservativeWidth(PDFont font, String text) {
        float conservativeWidth = text.length() * 500f;

        log.debug(
                "Conservative width estimate for font {} text '{}': {}",
                font.getName(),
                text,
                conservativeWidth);
        return conservativeWidth;
    }

    private float calculateWidthAdjustment(TextSegment segment, List<MatchRange> matches) {
        try {
            if (segment.getFont() == null || segment.getFontSize() <= 0) {
                return 0;
            }

            String fontName = segment.getFont().getName();
            if (fontName != null
                    && (fontName.contains("HOEPAP") || TextEncodingHelper.isFontSubset(fontName))) {
                log.debug("Skipping width adjustment for problematic/subset font: {}", fontName);
                return 0;
            }

            float totalOriginal = 0;
            float totalPlaceholder = 0;

            String text = segment.getText();

            for (MatchRange match : matches) {
                int segStart = Math.max(0, match.getStartPos() - segment.getStartPos());
                int segEnd = Math.min(text.length(), match.getEndPos() - segment.getStartPos());

                if (segStart < text.length() && segEnd > segStart) {
                    String originalPart = text.substring(segStart, segEnd);

                    float originalWidth =
                            safeGetStringWidth(segment.getFont(), originalPart)
                                    / FONT_SCALE_FACTOR
                                    * segment.getFontSize();

                    String placeholderPart =
                            createPlaceholderWithWidth(
                                    originalPart,
                                    originalWidth,
                                    segment.getFont(),
                                    segment.getFontSize());

                    float origUnits = safeGetStringWidth(segment.getFont(), originalPart);
                    float placeUnits = safeGetStringWidth(segment.getFont(), placeholderPart);

                    float orig = (origUnits / FONT_SCALE_FACTOR) * segment.getFontSize();
                    float place = (placeUnits / FONT_SCALE_FACTOR) * segment.getFontSize();

                    totalOriginal += orig;
                    totalPlaceholder += place;
                }
            }

            float adjustment = totalOriginal - totalPlaceholder;

            float maxReasonableAdjustment =
                    Math.max(
                            segment.getText().length() * segment.getFontSize() * 2,
                            totalOriginal * 1.5f // Allow up to 50% more than original width
                            );

            if (Math.abs(adjustment) > maxReasonableAdjustment) {
                log.debug(
                        "Width adjustment {} seems unreasonable for text length {}, capping to 0",
                        adjustment,
                        segment.getText().length());
                return 0;
            }

            return adjustment;
        } catch (Exception ex) {
            log.debug("Width adjustment failed: {}", ex.getMessage());
            return 0;
        }
    }

    private void modifyTokenForRedaction(
            List<Object> tokens,
            TextSegment segment,
            String newText,
            float adjustment,
            List<MatchRange> matches) {

        if (segment.getTokenIndex() < 0 || segment.getTokenIndex() >= tokens.size()) {
            return;
        }

        Object token = tokens.get(segment.getTokenIndex());
        String operatorName = segment.getOperatorName();

        try {
            if (("Tj".equals(operatorName) || "'".equals(operatorName))
                    && token instanceof COSString) {

                if (Math.abs(adjustment) < PRECISION_THRESHOLD) {
                    if (newText.isEmpty()) {
                        tokens.set(segment.getTokenIndex(), EMPTY_COS_STRING);
                    } else {
                        tokens.set(segment.getTokenIndex(), new COSString(newText));
                    }
                } else {
                    COSArray newArray = new COSArray();
                    newArray.add(new COSString(newText));
                    if (segment.getFontSize() > 0) {

                        float kerning = (-adjustment / segment.getFontSize()) * FONT_SCALE_FACTOR;

                        newArray.add(new COSFloat(kerning));
                    }
                    tokens.set(segment.getTokenIndex(), newArray);

                    int operatorIndex = segment.getTokenIndex() + 1;
                    if (operatorIndex < tokens.size()
                            && tokens.get(operatorIndex) instanceof Operator op
                            && op.getName().equals(operatorName)) {
                        tokens.set(operatorIndex, Operator.getOperator("TJ"));
                    }
                }
            } else if ("TJ".equals(operatorName) && token instanceof COSArray) {
                COSArray newArray = createRedactedTJArray((COSArray) token, segment, matches);
                tokens.set(segment.getTokenIndex(), newArray);
            }
        } catch (Exception e) {
            log.debug(
                    "Token modification failed for segment at index {}: {}",
                    segment.getTokenIndex(),
                    e.getMessage());
        }
    }

    private COSArray createRedactedTJArray(
            COSArray originalArray, TextSegment segment, List<MatchRange> matches) {
        try {
            COSArray newArray = new COSArray();
            int textOffsetInSegment = 0;

            for (COSBase element : originalArray) {
                if (element instanceof COSString cosString) {
                    String originalText = cosString.getString();

                    if (segment.getFont() != null
                            && !TextEncodingHelper.isTextSegmentRemovable(
                                    segment.getFont(), originalText)) {
                        log.debug(
                                "Skipping TJ text part '{}' - cannot be processed reliably with font {}",
                                originalText,
                                segment.getFont().getName());
                        newArray.add(element); // Keep original unchanged
                        textOffsetInSegment += originalText.length();
                        continue;
                    }

                    StringBuilder newText = new StringBuilder(originalText);
                    boolean modified = false;

                    for (MatchRange match : matches) {
                        int stringStartInPage = segment.getStartPos() + textOffsetInSegment;
                        int stringEndInPage = stringStartInPage + originalText.length();

                        int overlapStart = Math.max(match.getStartPos(), stringStartInPage);
                        int overlapEnd = Math.min(match.getEndPos(), stringEndInPage);

                        if (overlapStart < overlapEnd) {
                            int redactionStartInString = overlapStart - stringStartInPage;
                            int redactionEndInString = overlapEnd - stringStartInPage;
                            if (redactionStartInString >= 0
                                    && redactionEndInString <= originalText.length()) {
                                String originalPart =
                                        originalText.substring(
                                                redactionStartInString, redactionEndInString);

                                if (segment.getFont() != null
                                        && !TextEncodingHelper.isTextSegmentRemovable(
                                                segment.getFont(), originalPart)) {
                                    log.debug(
                                            "Skipping TJ text part '{}' - cannot be redacted reliably",
                                            originalPart);
                                    continue; // Skip this redaction, keep original text
                                }

                                modified = true;
                                float originalWidth = 0;
                                if (segment.getFont() != null && segment.getFontSize() > 0) {
                                    try {
                                        originalWidth =
                                                safeGetStringWidth(segment.getFont(), originalPart)
                                                        / FONT_SCALE_FACTOR
                                                        * segment.getFontSize();
                                    } catch (Exception e) {
                                        log.debug(
                                                "Failed to calculate original width for TJ placeholder: {}",
                                                e.getMessage());
                                    }
                                }

                                String placeholder =
                                        (originalWidth > 0)
                                                ? createPlaceholderWithWidth(
                                                        originalPart,
                                                        originalWidth,
                                                        segment.getFont(),
                                                        segment.getFontSize())
                                                : createPlaceholderWithFont(
                                                        originalPart, segment.getFont());

                                newText.replace(
                                        redactionStartInString, redactionEndInString, placeholder);
                            }
                        }
                    }

                    String modifiedString = newText.toString();
                    newArray.add(new COSString(modifiedString));

                    if (modified && segment.getFont() != null && segment.getFontSize() > 0) {
                        try {
                            float originalWidth =
                                    safeGetStringWidth(segment.getFont(), originalText)
                                            / FONT_SCALE_FACTOR
                                            * segment.getFontSize();
                            float modifiedWidth =
                                    safeGetStringWidth(segment.getFont(), modifiedString)
                                            / FONT_SCALE_FACTOR
                                            * segment.getFontSize();
                            float adjustment = originalWidth - modifiedWidth;
                            if (Math.abs(adjustment) > PRECISION_THRESHOLD) {
                                float kerning =
                                        (-adjustment / segment.getFontSize())
                                                * FONT_SCALE_FACTOR
                                                * 1.10f;

                                newArray.add(new COSFloat(kerning));
                            }
                        } catch (Exception e) {
                            log.debug(
                                    "Width adjustment calculation failed for segment: {}",
                                    e.getMessage());
                        }
                    }

                    textOffsetInSegment += originalText.length();
                } else {
                    newArray.add(element);
                }
            }
            return newArray;
        } catch (Exception e) {
            return originalArray;
        }
    }

    private String extractTextFromToken(Object token, String operatorName) {
        return switch (operatorName) {
            case "Tj", "'" -> {
                if (token instanceof COSString cosString) {
                    yield cosString.getString();
                }
                yield "";
            }
            case "TJ" -> {
                if (token instanceof COSArray cosArray) {
                    StringBuilder sb = new StringBuilder();
                    for (COSBase element : cosArray) {
                        if (element instanceof COSString cosString) {
                            sb.append(cosString.getString());
                        }
                    }
                    yield sb.toString();
                }
                yield "";
            }
            default -> "";
        };
    }

    private boolean detectCustomEncodingFonts(PDDocument document) {
        try {
            var documentCatalog = document.getDocumentCatalog();
            if (documentCatalog == null) {
                return false;
            }

            int totalFonts = 0;
            int customEncodedFonts = 0;
            int subsetFonts = 0;
            int unreliableFonts = 0;

            for (PDPage page : document.getPages()) {
                if (TextFinderUtils.hasProblematicFonts(page)) {
                    log.debug("Page contains fonts flagged as problematic by TextFinderUtils");
                }

                PDResources resources = page.getResources();
                if (resources == null) {
                    continue;
                }

                for (COSName fontName : resources.getFontNames()) {
                    try {
                        PDFont font = resources.getFont(fontName);
                        if (font != null) {
                            totalFonts++;

                            // Enhanced analysis using helper classes
                            boolean isSubset = TextEncodingHelper.isFontSubset(font.getName());
                            boolean hasCustomEncoding = TextEncodingHelper.hasCustomEncoding(font);
                            boolean isReliable = WidthCalculator.isWidthCalculationReliable(font);
                            boolean canCalculateWidths =
                                    TextEncodingHelper.canCalculateBasicWidths(font);

                            if (isSubset) {
                                subsetFonts++;
                            }

                            if (hasCustomEncoding) {
                                customEncodedFonts++;
                                log.debug("Font {} has custom encoding", font.getName());
                            }

                            if (!isReliable || !canCalculateWidths) {
                                unreliableFonts++;
                                log.debug(
                                        "Font {} flagged as unreliable: reliable={}, canCalculateWidths={}",
                                        font.getName(),
                                        isReliable,
                                        canCalculateWidths);
                            }

                            if (!TextFinderUtils.validateFontReliability(font)) {
                                log.debug(
                                        "Font {} failed comprehensive reliability check",
                                        font.getName());
                            }
                        }
                    } catch (Exception e) {
                        log.debug(
                                "Font loading/analysis failed for {}: {}",
                                fontName.getName(),
                                e.getMessage());
                        customEncodedFonts++;
                        unreliableFonts++;
                        totalFonts++;
                    }
                }
            }

            log.info(
                    "Enhanced font analysis: {}/{} custom encoding, {}/{} subset, {}/{} unreliable fonts",
                    customEncodedFonts,
                    totalFonts,
                    subsetFonts,
                    totalFonts,
                    unreliableFonts,
                    totalFonts);

            // Consider document problematic if we have custom encodings or unreliable fonts
            return customEncodedFonts > 0 || unreliableFonts > 0;

        } catch (Exception e) {
            log.warn("Enhanced font detection analysis failed: {}", e.getMessage());
            return true; // Assume problematic if analysis fails
        }
    }

    private void processFormXObject(
            PDDocument document,
            PDFormXObject formXObject,
            Set<String> targetWords,
            boolean useRegex,
            boolean wholeWordSearch) {

        try {
            PDResources xobjResources = formXObject.getResources();
            if (xobjResources == null) {
                return;
            }

            for (COSName xobjName : xobjResources.getXObjectNames()) {
                PDXObject nestedXObj = xobjResources.getXObject(xobjName);
                if (nestedXObj instanceof PDFormXObject nestedFormXObj) {
                    processFormXObject(
                            document, nestedFormXObj, targetWords, useRegex, wholeWordSearch);
                }
            }

            PDFStreamParser parser = new PDFStreamParser(formXObject);
            List<Object> tokens = new ArrayList<>();
            Object token;
            while ((token = parser.parseNextToken()) != null) {
                tokens.add(token);
            }

            List<TextSegment> textSegments = extractTextSegmentsFromXObject(xobjResources, tokens);
            String completeText = buildCompleteText(textSegments);

            List<MatchRange> matches =
                    findAllMatches(completeText, targetWords, useRegex, wholeWordSearch);

            if (!matches.isEmpty()) {
                List<Object> redactedTokens =
                        applyRedactionsToTokens(tokens, textSegments, matches);
                writeRedactedContentToXObject(document, formXObject, redactedTokens);
                log.debug("Processed {} redactions in Form XObject", matches.size());
            }

        } catch (Exception e) {
            log.warn("Failed to process Form XObject: {}", e.getMessage());
        }
    }

    private List<TextSegment> extractTextSegmentsFromXObject(
            PDResources resources, List<Object> tokens) {
        List<TextSegment> segments = new ArrayList<>();
        int currentTextPos = 0;
        GraphicsState graphicsState = new GraphicsState();

        for (int i = 0; i < tokens.size(); i++) {
            Object currentToken = tokens.get(i);

            if (currentToken instanceof Operator op) {
                String opName = op.getName();

                if ("Tf".equals(opName) && i >= 2) {
                    try {
                        COSName fontName = (COSName) tokens.get(i - 2);
                        COSBase fontSizeBase = (COSBase) tokens.get(i - 1);
                        if (fontSizeBase instanceof COSNumber cosNumber) {
                            graphicsState.setFont(resources.getFont(fontName));
                            graphicsState.setFontSize(cosNumber.floatValue());
                        }
                    } catch (ClassCastException | IOException e) {
                        log.debug("Font extraction failed in XObject: {}", e.getMessage());
                    }
                }

                currentTextPos =
                        getCurrentTextPos(
                                tokens, segments, currentTextPos, graphicsState, i, opName);
            }
        }

        return segments;
    }

    private int getCurrentTextPos(
            List<Object> tokens,
            List<TextSegment> segments,
            int currentTextPos,
            GraphicsState graphicsState,
            int i,
            String opName) {
        if (isTextShowingOperator(opName) && i > 0) {
            String textContent = extractTextFromToken(tokens.get(i - 1), opName);
            if (!textContent.isEmpty()) {
                segments.add(
                        new TextSegment(
                                i - 1,
                                opName,
                                textContent,
                                currentTextPos,
                                currentTextPos + textContent.length(),
                                graphicsState.font,
                                graphicsState.fontSize));
                currentTextPos += textContent.length();
            }
        }
        return currentTextPos;
    }

    private void writeRedactedContentToXObject(
            PDDocument document, PDFormXObject formXObject, List<Object> redactedTokens)
            throws IOException {

        PDStream newStream = new PDStream(document);

        try (var out = newStream.createOutputStream()) {
            ContentStreamWriter writer = new ContentStreamWriter(out);
            writer.writeTokens(redactedTokens);
        }

        formXObject.getCOSObject().removeItem(COSName.CONTENTS);
        formXObject.getCOSObject().setItem(COSName.CONTENTS, newStream.getCOSObject());
    }

    // -----------------------------------------------------------------------
    // Page element extraction (used by full-page wipe to draw individual boxes)
    // -----------------------------------------------------------------------

    /**
     * Returns bounding boxes for every text line and image on {@code page} in PDF user-space
     * coordinates: {@code [x1, y1, x2, y2]} (origin bottom-left, Y increases upward).
     */
    private List<float[]> extractPageElementBoxes(PDDocument document, PDPage page, int pageIndex)
            throws IOException {
        List<float[]> boxes = new ArrayList<>();

        // --- Text lines ---
        AllTextLineExtractor textExtractor =
                new AllTextLineExtractor(pageIndex + 1, page.getBBox().getHeight());
        textExtractor.getText(document);
        boxes.addAll(textExtractor.getLineBoxes());

        // --- Images ---
        PageImageExtractor imgExtractor = new PageImageExtractor(page);
        imgExtractor.processPage(page);
        for (float[] imgBox : imgExtractor.getImageBoxes()) {
            boxes.add(imgBox);
        }

        return boxes;
    }

    /**
     * Draws solid-colour rectangles over the image bounding boxes specified in {@code imageBoxes}.
     * Each entry is {@code [pageIndex, x1, y1, x2, y2]} in PDF user-space (0-based page index).
     */
    private void redactImageBoxes(PDDocument document, List<float[]> imageBoxes, Color color)
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

    /**
     * Collapses letter-spaced text produced by position-sorted text extraction.
     *
     * <p>When a PDF text stripper runs with {@code setSortByPosition(true)}, letter-spaced headings
     * (e.g. CSS {@code letter-spacing}) come out as {@code "T a b l e o f c o n t e n t s"} —
     * individual characters separated by single spaces, with double spaces between words. The
     * non-sorted {@link TextFinder} extracts these headings as plain words, so the two
     * representations never match. This method converts the spaced form back to words:
     *
     * <ol>
     *   <li>Split on single spaces (preserving empty tokens from double spaces).
     *   <li>Consecutive single-character tokens → concatenated into one word.
     *   <li>Empty tokens (double-space word boundary) and multi-character tokens → word breaks.
     * </ol>
     *
     * Unaffected by ordinary multi-word strings that contain no letter-spacing.
     */
    private static String collapseLetterSpacing(String text) {
        // Split on single space only; double spaces produce an empty token that acts as
        // a word separator between letter-spaced words.
        String[] tokens = text.split(" ", -1);
        StringBuilder result = new StringBuilder();
        StringBuilder current = new StringBuilder();
        for (String token : tokens) {
            if (token.isEmpty()) {
                // Double-space: flush the accumulated single-char word
                if (current.length() > 0) {
                    if (result.length() > 0) result.append(' ');
                    result.append(current);
                    current.setLength(0);
                }
            } else if (token.length() == 1) {
                // Single character — may be part of letter-spaced word
                current.append(token);
            } else {
                // Multi-character word: flush any pending single-char accumulation first
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
                    findTextToRedact(document, new String[] {candidate}, true, false);
            if (m.isEmpty()) {
                m = findTextToRedact(document, new String[] {candidate}, false, false);
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
     * Locates {@code startStr} in the document and returns {@link PDFText} blocks (in screen-space
     * Y, matching {@link TextFinder} output) for every text line and image from that point up to
     * (but NOT including) the line where {@code endStr} begins. If {@code endStr} is blank, redacts
     * from {@code startStr} to the end of the document.
     *
     * <p>The end boundary is exclusive — the heading of the next section is NOT itself redacted.
     * Matching uses case-insensitive regex with a plain-string fallback (see {@link
     * #findWithFallbacks}), with letter-spacing collapse to handle headings like "T a b l e".
     *
     * <p>Results are intended to be passed directly to {@link #redactFoundText}.
     */
    private List<PDFText> collectRangeBlocks(PDDocument document, String startStr, String endStr)
            throws IOException {

        PDPageTree allPages = document.getDocumentCatalog().getPages();
        int totalPages = allPages.getCount();

        // Find ALL occurrences of the start string, sorted by document position.
        Map<Integer, List<PDFText>> startMatchesByPage = findWithFallbacks(document, startStr);
        if (startMatchesByPage.isEmpty()) {
            log.warn("[redact/execute] range start not found: '{}'", startStr);
            return Collections.emptyList();
        }
        // Flatten to a position-sorted list.
        List<int[]> startPageList = new ArrayList<>(); // [pageIdx]
        List<PDFText> startTextList = new ArrayList<>();
        for (int page : startMatchesByPage.keySet().stream().sorted().toList()) {
            List<PDFText> hits = new ArrayList<>(startMatchesByPage.get(page));
            hits.sort(Comparator.comparingDouble(PDFText::getY1));
            for (PDFText t : hits) {
                startPageList.add(new int[] {page});
                startTextList.add(t);
            }
        }

        // Find ALL occurrences of the end string, sorted by document position.
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

        // Pair each start anchor with the first end anchor that comes strictly after it
        // in document order. The same start string may appear multiple times (e.g. once in a
        // table of contents and once as the actual section heading), so we process every pair
        // independently and combine the blocks.
        List<PDFText> blocks = new ArrayList<>();
        for (int si = 0; si < startTextList.size(); si++) {
            int startPage = startPageList.get(si)[0];
            PDFText startText = startTextList.get(si);

            int endPage;
            PDFText endText = null;
            if (openEnded) {
                endPage = totalPages - 1;
            } else {
                // Find the first end anchor strictly after this start in reading order.
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
                    // No end anchor after this start — skip this occurrence.
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

            // Start boundary (inclusive): lines at or below the top of startText.
            float startThreshold =
                    (pageIdx == startPage) ? pageHeight - startText.getY1() : Float.MAX_VALUE;

            // End boundary (exclusive): top of endText, only on the final page.
            float endThreshold =
                    (pageIdx == endPage && endText != null)
                            ? pageHeight - endText.getY1()
                            : -Float.MAX_VALUE;

            // --- Text lines ---
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

            // --- Images in range ---
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
     * Parses the newline-separated image box string from the request. Format per line: {@code
     * pageIndex,x1,y1,x2,y2} (all floats, 0-based page index, PDF coords).
     */
    private List<float[]> parseImageBoxes(String raw) {
        List<float[]> result = new ArrayList<>();
        if (raw == null || raw.isBlank()) {
            return result;
        }
        for (String line : raw.split("\n")) {
            line = line.trim();
            if (line.isEmpty()) {
                continue;
            }
            try {
                String[] parts = line.split(",");
                if (parts.length == 5) {
                    result.add(
                            new float[] {
                                Float.parseFloat(parts[0].trim()),
                                Float.parseFloat(parts[1].trim()),
                                Float.parseFloat(parts[2].trim()),
                                Float.parseFloat(parts[3].trim()),
                                Float.parseFloat(parts[4].trim())
                            });
                } else {
                    log.warn("[redact/execute] skipping malformed image box line: '{}'", line);
                }
            } catch (NumberFormatException e) {
                log.warn(
                        "[redact/execute] invalid number in image box line '{}': {}",
                        line,
                        e.getMessage());
            }
        }
        return result;
    }

    // -----------------------------------------------------------------------
    // Inner classes for element extraction
    // -----------------------------------------------------------------------

    /**
     * PDFTextStripper subclass that collects all text positions and groups them into line-level
     * bounding boxes in PDF user-space (origin bottom-left, Y up).
     */
    private static final class AllTextLineExtractor extends PDFTextStripper {

        private final float pageHeight;
        private final List<float[]> lineBoxes = new ArrayList<>();

        // Positions for the current in-progress line
        private final List<TextPosition> currentLine = new ArrayList<>();
        private float lastScreenY = Float.NaN;
        private static final float LINE_Y_TOLERANCE = 3.0f;

        AllTextLineExtractor(int pageNumber, float pageHeight) throws IOException {
            this.pageHeight = pageHeight;
            setStartPage(pageNumber);
            setEndPage(pageNumber);
            setSortByPosition(true);
        }

        List<float[]> getLineBoxes() {
            return lineBoxes;
        }

        @Override
        protected void writeString(String text, List<TextPosition> positions) {
            for (TextPosition tp : positions) {
                // Skip whitespace-only positions (spaces, newline markers, indent characters).
                // These have a TextPosition but no visible glyph; including them causes
                // space-only "lines" to produce degenerate segments that appear as thin
                // black bars after redaction.
                String unicode = tp.getUnicode();
                if (unicode == null || unicode.isBlank()) {
                    continue;
                }
                float screenY = tp.getY(); // screen coords: Y from top, down
                if (!Float.isNaN(lastScreenY)
                        && Math.abs(screenY - lastScreenY) > LINE_Y_TOLERANCE) {
                    flushLine();
                }
                lastScreenY = screenY;
                currentLine.add(tp);
            }
        }

        @Override
        protected void endPage(PDPage page) throws IOException {
            flushLine();
            super.endPage(page);
        }

        private void flushLine() {
            if (currentLine.isEmpty()) {
                return;
            }
            float minX = Float.MAX_VALUE, maxX = -Float.MAX_VALUE;
            float minScreenY = Float.MAX_VALUE, maxScreenY = -Float.MAX_VALUE;
            for (TextPosition tp : currentLine) {
                minX = Math.min(minX, tp.getX());
                maxX = Math.max(maxX, tp.getX() + tp.getWidth());
                minScreenY = Math.min(minScreenY, tp.getY() - tp.getHeight());
                maxScreenY = Math.max(maxScreenY, tp.getY());
            }
            emitSegment(minX, maxX, minScreenY, maxScreenY);
            currentLine.clear();
            lastScreenY = Float.NaN;
        }

        private void emitSegment(float minX, float maxX, float minScreenY, float maxScreenY) {
            float pdfY1 = pageHeight - maxScreenY; // bottom in PDF coords
            float pdfY2 = pageHeight - minScreenY; // top in PDF coords
            lineBoxes.add(new float[] {minX, pdfY1, maxX, pdfY2});
        }
    }

    /**
     * PDFGraphicsStreamEngine that intercepts {@code drawImage} calls and records each image's
     * bounding box in PDF user-space (origin bottom-left, Y up) via the current transformation
     * matrix.
     */
    private static final class PageImageExtractor extends PDFGraphicsStreamEngine {

        private final List<float[]> imageBoxes = new ArrayList<>();
        private final Point2D.Float currentPoint = new Point2D.Float();

        PageImageExtractor(PDPage page) {
            super(page);
        }

        List<float[]> getImageBoxes() {
            return imageBoxes;
        }

        @Override
        public void drawImage(PDImage pdImage) throws IOException {
            Matrix ctm = getGraphicsState().getCurrentTransformationMatrix();
            float a = ctm.getScaleX(), b = ctm.getShearY();
            float c = ctm.getShearX(), d = ctm.getScaleY();
            float e = ctm.getTranslateX(), f = ctm.getTranslateY();
            float[] xs = {e, a + e, c + e, a + c + e};
            float[] ys = {f, b + f, d + f, b + d + f};
            float x1 = Float.MAX_VALUE, y1 = Float.MAX_VALUE;
            float x2 = -Float.MAX_VALUE, y2 = -Float.MAX_VALUE;
            for (float x : xs) {
                x1 = Math.min(x1, x);
                x2 = Math.max(x2, x);
            }
            for (float y : ys) {
                y1 = Math.min(y1, y);
                y2 = Math.max(y2, y);
            }
            imageBoxes.add(new float[] {x1, y1, x2, y2});
        }

        @Override
        public void appendRectangle(Point2D p0, Point2D p1, Point2D p2, Point2D p3) {}

        @Override
        public void clip(int windingRule) {}

        @Override
        public void moveTo(float x, float y) {
            currentPoint.setLocation(x, y);
        }

        @Override
        public void lineTo(float x, float y) {
            currentPoint.setLocation(x, y);
        }

        @Override
        public void curveTo(float x1, float y1, float x2, float y2, float x3, float y3) {
            currentPoint.setLocation(x3, y3);
        }

        @Override
        public Point2D getCurrentPoint() {
            return currentPoint;
        }

        @Override
        public void closePath() {}

        @Override
        public void endPath() {}

        @Override
        public void strokePath() {}

        @Override
        public void fillPath(int windingRule) {}

        @Override
        public void fillAndStrokePath(int windingRule) {}

        @Override
        public void shadingFill(COSName shadingName) {}
    }
}
