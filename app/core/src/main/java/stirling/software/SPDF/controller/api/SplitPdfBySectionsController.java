package stirling.software.SPDF.controller.api;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.multipdf.LayerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageContentStream.AppendMode;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.util.Matrix;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.SplitTypes;
import stirling.software.SPDF.model.api.SplitPdfBySectionsRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.PDFService;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/general")
@Tag(name = "General", description = "General APIs")
@RequiredArgsConstructor
public class SplitPdfBySectionsController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final PDFService pdfService;

    @PostMapping(value = "/split-pdf-by-sections", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Split PDF pages into smaller sections",
            description =
                    "Split each page of a PDF into smaller sections based on the user's choice"
                            + " which page to split, and how to split"
                            + " ( halves, thirds, quarters, etc.), both vertically and horizontally."
                            + " Input:PDF Output:ZIP-PDF Type:SISO")
    public ResponseEntity<StreamingResponseBody> splitPdf(
            @ModelAttribute SplitPdfBySectionsRequest request) throws Exception {
        List<ByteArrayOutputStream> splitDocumentsBoas = new ArrayList<>();

        MultipartFile file = request.getFileInput();
        String pageNumbers = request.getPageNumbers();
        SplitTypes splitMode =
                Optional.ofNullable(request.getSplitMode())
                        .map(SplitTypes::valueOf)
                        .orElse(SplitTypes.SPLIT_ALL);

        PDDocument sourceDocument = pdfDocumentFactory.load(file);

        Set<Integer> pagesToSplit =
                getPagesToSplit(pageNumbers, splitMode, sourceDocument.getNumberOfPages());

        // Process the PDF based on split parameters
        int horiz = request.getHorizontalDivisions() + 1;
        int verti = request.getVerticalDivisions() + 1;
        boolean merge = Boolean.TRUE.equals(request.getMerge());
        List<PDDocument> splitDocuments = splitPdfPages(sourceDocument, verti, horiz, pagesToSplit);

        String filename = GeneralUtils.generateFilename(file.getOriginalFilename(), "_split.pdf");
        if (merge) {
            TempFile tempFile = new TempFile(tempFileManager, ".pdf");
            try (PDDocument merged = pdfService.mergeDocuments(splitDocuments);
                    OutputStream out = Files.newOutputStream(tempFile.getPath())) {
                merged.save(out);
                for (PDDocument d : splitDocuments) d.close();
                sourceDocument.close();
            }
            return WebResponseUtils.pdfFileToWebResponse(tempFile, filename + "_split.pdf");
        }
        for (PDDocument doc : splitDocuments) {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            doc.close();
            splitDocumentsBoas.add(baos);
        }

        sourceDocument.close();

        TempFile zipTempFile = new TempFile(tempFileManager, ".zip");
        try (ZipOutputStream zipOut =
                new ZipOutputStream(Files.newOutputStream(zipTempFile.getPath()))) {
            int pageNum = 1;
            for (int i = 0; i < splitDocumentsBoas.size(); i++) {
                ByteArrayOutputStream baos = splitDocumentsBoas.get(i);
                int sectionNum = (i % (horiz * verti)) + 1;
                String fileName = filename + "_" + pageNum + "_" + sectionNum + ".pdf";
                byte[] pdf = baos.toByteArray();
                ZipEntry pdfEntry = new ZipEntry(fileName);
                zipOut.putNextEntry(pdfEntry);
                zipOut.write(pdf);
                zipOut.closeEntry();

                if (sectionNum == horiz * verti) pageNum++;
            }
        }
        return WebResponseUtils.zipFileToWebResponse(zipTempFile, filename + "_split.zip");
    }

    // Based on the mode, get the pages that need to be split and return the pages set
    private Set<Integer> getPagesToSplit(String pageNumbers, SplitTypes splitMode, int totalPages) {
        Set<Integer> pagesToSplit = new HashSet<>();

        switch (splitMode) {
            case CUSTOM:
                if (pageNumbers == null || pageNumbers.isBlank()) {
                    throw new IllegalArgumentException("Custom mode requires page numbers input.");
                }
                String[] pageOrderArr = pageNumbers.split(",");
                List<Integer> pageListToSplit =
                        GeneralUtils.parsePageList(pageOrderArr, totalPages, false);
                pagesToSplit.addAll(pageListToSplit);
                break;

            case SPLIT_ALL:
                for (int i = 0; i < totalPages; i++) {
                    pagesToSplit.add(i);
                }
                break;

            case SPLIT_ALL_EXCEPT_FIRST:
                for (int i = 1; i < totalPages; i++) {
                    pagesToSplit.add(i);
                }
                break;

            case SPLIT_ALL_EXCEPT_LAST:
                for (int i = 0; i < totalPages - 1; i++) {
                    pagesToSplit.add(i);
                }
                break;

            case SPLIT_ALL_EXCEPT_FIRST_AND_LAST:
                for (int i = 1; i < totalPages - 1; i++) {
                    pagesToSplit.add(i);
                }
                break;

            default:
                throw new IllegalArgumentException("Unsupported split mode: " + splitMode);
        }

        return pagesToSplit;
    }

    public List<PDDocument> splitPdfPages(
            PDDocument document,
            int horizontalDivisions,
            int verticalDivisions,
            Set<Integer> pagesToSplit)
            throws IOException {
        List<PDDocument> splitDocuments = new ArrayList<>();

        int pageIndex = 0;
        for (PDPage originalPage : document.getPages()) {
            // If current page is not to split, add it to the splitDocuments directly.
            if (!pagesToSplit.contains(pageIndex)) {
                PDDocument newDoc = pdfDocumentFactory.createNewDocument();
                newDoc.addPage(originalPage);
                splitDocuments.add(newDoc);
            } else {
                // Otherwise, split current page.
                PDRectangle originalMediaBox = originalPage.getMediaBox();
                float width = originalMediaBox.getWidth();
                float height = originalMediaBox.getHeight();
                float subPageWidth = width / horizontalDivisions;
                float subPageHeight = height / verticalDivisions;

                LayerUtility layerUtility = new LayerUtility(document);

                for (int i = 0; i < horizontalDivisions; i++) {
                    for (int j = 0; j < verticalDivisions; j++) {
                        PDDocument subDoc = new PDDocument();
                        PDPage subPage = new PDPage(new PDRectangle(subPageWidth, subPageHeight));
                        subDoc.addPage(subPage);

                        PDFormXObject form =
                                layerUtility.importPageAsForm(
                                        document, document.getPages().indexOf(originalPage));

                        try (PDPageContentStream contentStream =
                                new PDPageContentStream(
                                        subDoc, subPage, AppendMode.APPEND, true, true)) {
                            // Set clipping area and position
                            float translateX = -subPageWidth * i;

                            // float translateY = height - subPageHeight * (verticalDivisions - j);
                            float translateY = -subPageHeight * (verticalDivisions - 1 - j);

                            contentStream.saveGraphicsState();
                            contentStream.addRect(0, 0, subPageWidth, subPageHeight);
                            contentStream.clip();
                            contentStream.transform(new Matrix(1, 0, 0, 1, translateX, translateY));

                            // Draw the form
                            contentStream.drawForm(form);
                            contentStream.restoreGraphicsState();
                        }

                        splitDocuments.add(subDoc);
                    }
                }
            }
            pageIndex++;
        }

        return splitDocuments;
    }
}
