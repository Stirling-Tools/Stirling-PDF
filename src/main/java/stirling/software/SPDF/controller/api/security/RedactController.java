package stirling.software.SPDF.controller.api.security;

import java.awt.*;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.PDFText;
import stirling.software.SPDF.model.api.security.ManualRedactPdfRequest;
import stirling.software.SPDF.model.api.security.RedactPdfRequest;
import stirling.software.SPDF.model.api.security.RedactionArea;
import stirling.software.SPDF.pdf.TextFinder;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;
import stirling.software.SPDF.utils.GeneralUtils;
import stirling.software.SPDF.utils.PdfUtils;
import stirling.software.SPDF.utils.WebResponseUtils;
import stirling.software.SPDF.utils.propertyeditor.StringToArrayListPropertyEditor;

@RestController
@RequestMapping("/api/v1/security")
@Slf4j
@Tag(name = "Security", description = "Security APIs")
@RequiredArgsConstructor
public class RedactController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @InitBinder
    public void initBinder(WebDataBinder binder) {
        binder.registerCustomEditor(
                List.class, "redactions", new StringToArrayListPropertyEditor());
    }

    @PostMapping(value = "/redact", consumes = "multipart/form-data")
    @Operation(
            summary = "Redacts areas and pages in a PDF document",
            description =
                    "This operation takes an input PDF file with a list of areas, page"
                            + " number(s)/range(s)/function(s) to redact. Input:PDF, Output:PDF,"
                            + " Type:SISO")
    public ResponseEntity<byte[]> redactPDF(@ModelAttribute ManualRedactPdfRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();
        List<RedactionArea> redactionAreas = request.getRedactions();

        PDDocument document = pdfDocumentFactory.load(file);

        PDPageTree allPages = document.getDocumentCatalog().getPages();

        redactPages(request, document, allPages);
        redactAreas(redactionAreas, document, allPages);

        if (Boolean.TRUE.equals(request.getConvertPDFToImage())) {
            PDDocument convertedPdf = PdfUtils.convertPdfToPdfImage(document);
            document.close();
            document = convertedPdf;
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        document.close();

        byte[] pdfContent = baos.toByteArray();
        return WebResponseUtils.bytesToWebResponse(
                pdfContent,
                Filenames.toSimpleFileName(file.getOriginalFilename()).replaceFirst("[.][^.]+$", "")
                        + "_redacted.pdf");
    }

    private void redactAreas(
            List<RedactionArea> redactionAreas, PDDocument document, PDPageTree allPages)
            throws IOException {
        // Group redaction areas by page
        Map<Integer, List<RedactionArea>> redactionsByPage = new HashMap<>();

        // Process and validate each redaction area
        for (RedactionArea redactionArea : redactionAreas) {
            if (redactionArea.getPage() == null
                    || redactionArea.getPage() <= 0
                    || redactionArea.getHeight() == null
                    || redactionArea.getHeight() <= 0.0D
                    || redactionArea.getWidth() == null
                    || redactionArea.getWidth() <= 0.0D) continue;

            // Group by page number
            redactionsByPage
                    .computeIfAbsent(redactionArea.getPage(), k -> new ArrayList<>())
                    .add(redactionArea);
        }

        // Process each page only once
        for (Map.Entry<Integer, List<RedactionArea>> entry : redactionsByPage.entrySet()) {
            Integer pageNumber = entry.getKey();
            List<RedactionArea> areasForPage = entry.getValue();

            if (pageNumber > allPages.getCount()) {
                continue; // Skip if page number is out of bounds
            }

            PDPage page = allPages.get(pageNumber - 1);
            PDRectangle box = page.getBBox();

            // Create only one content stream per page
            PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true);

            // Process all redactions for this page
            for (RedactionArea redactionArea : areasForPage) {
                Color redactColor = decodeOrDefault(redactionArea.getColor(), Color.BLACK);
                contentStream.setNonStrokingColor(redactColor);

                float x = redactionArea.getX().floatValue();
                float y = redactionArea.getY().floatValue();
                float width = redactionArea.getWidth().floatValue();
                float height = redactionArea.getHeight().floatValue();

                contentStream.addRect(x, box.getHeight() - y - height, width, height);
                contentStream.fill();
            }

            contentStream.close();
        }
    }

    private void redactPages(
            ManualRedactPdfRequest request, PDDocument document, PDPageTree allPages)
            throws IOException {
        Color redactColor = decodeOrDefault(request.getPageRedactionColor(), Color.BLACK);
        List<Integer> pageNumbers = getPageNumbers(request, allPages.getCount());
        for (Integer pageNumber : pageNumbers) {
            PDPage page = allPages.get(pageNumber);

            PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true);
            contentStream.setNonStrokingColor(redactColor);

            PDRectangle box = page.getBBox();

            contentStream.addRect(0, 0, box.getWidth(), box.getHeight());
            contentStream.fill();
            contentStream.close();
        }
    }

    private Color decodeOrDefault(String hex, Color defaultColor) {
        try {
            if (hex != null && !hex.startsWith("#")) {
                hex = "#" + hex;
            }
            return Color.decode(hex);
        } catch (Exception e) {
            return defaultColor;
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

    @PostMapping(value = "/auto-redact", consumes = "multipart/form-data")
    @Operation(
            summary = "Redacts listOfText in a PDF document",
            description =
                    "This operation takes an input PDF file and redacts the provided listOfText."
                            + " Input:PDF, Output:PDF, Type:SISO")
    public ResponseEntity<byte[]> redactPdf(@ModelAttribute RedactPdfRequest request)
            throws Exception {
        MultipartFile file = request.getFileInput();
        String listOfTextString = request.getListOfText();
        boolean useRegex = Boolean.TRUE.equals(request.getUseRegex());
        boolean wholeWordSearchBool = Boolean.TRUE.equals(request.getWholeWordSearch());
        String colorString = request.getRedactColor();
        float customPadding = request.getCustomPadding();
        boolean convertPDFToImage = Boolean.TRUE.equals(request.getConvertPDFToImage());

        String[] listOfText = listOfTextString.split("\n");
        PDDocument document = pdfDocumentFactory.load(file);

        Color redactColor;
        try {
            if (!colorString.startsWith("#")) {
                colorString = "#" + colorString;
            }
            redactColor = Color.decode(colorString);
        } catch (NumberFormatException e) {
            log.warn("Invalid color string provided. Using default color BLACK for redaction.");
            redactColor = Color.BLACK;
        }

        for (String text : listOfText) {
            text = text.trim();
            TextFinder textFinder = new TextFinder(text, useRegex, wholeWordSearchBool);
            List<PDFText> foundTexts = textFinder.getTextLocations(document);
            redactFoundText(document, foundTexts, customPadding, redactColor);
        }

        if (convertPDFToImage) {
            PDDocument convertedPdf = PdfUtils.convertPdfToPdfImage(document);
            document.close();
            document = convertedPdf;
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        document.close();

        byte[] pdfContent = baos.toByteArray();
        return WebResponseUtils.bytesToWebResponse(
                pdfContent,
                Filenames.toSimpleFileName(file.getOriginalFilename()).replaceFirst("[.][^.]+$", "")
                        + "_redacted.pdf");
    }

    private void redactFoundText(
            PDDocument document, List<PDFText> blocks, float customPadding, Color redactColor)
            throws IOException {
        var allPages = document.getDocumentCatalog().getPages();

        for (PDFText block : blocks) {
            var page = allPages.get(block.getPageIndex());
            PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true);
            contentStream.setNonStrokingColor(redactColor);
            float padding = (block.getY2() - block.getY1()) * 0.3f + customPadding;
            PDRectangle pageBox = page.getBBox();
            contentStream.addRect(
                    block.getX1(),
                    pageBox.getHeight() - block.getY1() - padding,
                    block.getX2() - block.getX1(),
                    block.getY2() - block.getY1() + 2 * padding);
            contentStream.fill();
            contentStream.close();
        }
    }
}
