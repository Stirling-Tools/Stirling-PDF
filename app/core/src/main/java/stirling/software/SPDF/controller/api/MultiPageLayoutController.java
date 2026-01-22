package stirling.software.SPDF.controller.api;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.apache.pdfbox.multipdf.LayerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.util.Matrix;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.general.MergeMultiplePagesRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralFormCopyUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.WebResponseUtils;

@GeneralApi
@RequiredArgsConstructor
@Slf4j
public class MultiPageLayoutController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @AutoJobPostMapping(value = "/multi-page-layout", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Merge multiple pages of a PDF document into a single page",
            description =
                    "This operation takes an input PDF file and the number of pages to merge into a"
                            + " single sheet in the output PDF file. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> mergeMultiplePagesIntoOne(
            @ModelAttribute MergeMultiplePagesRequest request) throws IOException {

        int pagesPerSheet = request.getPagesPerSheet();
        MultipartFile file = request.getFileInput();
        boolean addBorder = Boolean.TRUE.equals(request.getAddBorder());

        if (pagesPerSheet != 2
                && pagesPerSheet != 3
                && pagesPerSheet != (int) Math.sqrt(pagesPerSheet) * Math.sqrt(pagesPerSheet)) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidFormat",
                    "Invalid {0} format: {1}",
                    "pagesPerSheet",
                    "must be 2, 3 or a perfect square");
        }

        int cols =
                pagesPerSheet == 2 || pagesPerSheet == 3
                        ? pagesPerSheet
                        : (int) Math.sqrt(pagesPerSheet);
        int rows = pagesPerSheet == 2 || pagesPerSheet == 3 ? 1 : (int) Math.sqrt(pagesPerSheet);

        try (PDDocument sourceDocument = pdfDocumentFactory.load(file)) {
            try (PDDocument newDocument =
                    pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDocument)) {
                int totalPages = sourceDocument.getNumberOfPages();
                LayerUtility layerUtility = new LayerUtility(newDocument);

                // Calculate cell dimensions once (all output pages are A4) - declare outside try
                // blocks
                float cellWidth = PDRectangle.A4.getWidth() / cols;
                float cellHeight = PDRectangle.A4.getHeight() / rows;

                // Process pages in groups of pagesPerSheet, creating a new page and content stream
                // for each group
                for (int i = 0; i < totalPages; i += pagesPerSheet) {
                    // Create a new output page for each group of pagesPerSheet
                    PDPage newPage = new PDPage(PDRectangle.A4);
                    newDocument.addPage(newPage);

                    // Use try-with-resources for each content stream to ensure proper cleanup
                    // resetContext=true: Start with a clean graphics state for new content
                    try (PDPageContentStream contentStream =
                            new PDPageContentStream(
                                    newDocument,
                                    newPage,
                                    PDPageContentStream.AppendMode.APPEND,
                                    true,
                                    true)) {
                        float borderThickness = 1.5f; // Specify border thickness as required
                        contentStream.setLineWidth(borderThickness);
                        contentStream.setStrokingColor(Color.BLACK);

                        // Process all pages in this group
                        for (int j = 0; j < pagesPerSheet && (i + j) < totalPages; j++) {
                            int pageIndex = i + j;
                            PDPage sourcePage = sourceDocument.getPage(pageIndex);
                            PDRectangle rect = sourcePage.getMediaBox();
                            float scaleWidth = cellWidth / rect.getWidth();
                            float scaleHeight = cellHeight / rect.getHeight();
                            float scale = Math.min(scaleWidth, scaleHeight);

                            int adjustedPageIndex = j % pagesPerSheet;
                            int rowIndex = adjustedPageIndex / cols;
                            int colIndex = adjustedPageIndex % cols;

                            float x =
                                    colIndex * cellWidth
                                            + (cellWidth - rect.getWidth() * scale) / 2;
                            float y =
                                    newPage.getMediaBox().getHeight()
                                            - ((rowIndex + 1) * cellHeight
                                                    - (cellHeight - rect.getHeight() * scale) / 2);

                            contentStream.saveGraphicsState();
                            contentStream.transform(Matrix.getTranslateInstance(x, y));
                            contentStream.transform(Matrix.getScaleInstance(scale, scale));

                            PDFormXObject formXObject =
                                    layerUtility.importPageAsForm(sourceDocument, pageIndex);
                            contentStream.drawForm(formXObject);

                            contentStream.restoreGraphicsState();

                            if (addBorder) {
                                // Draw border around each page
                                float borderX = colIndex * cellWidth;
                                float borderY =
                                        newPage.getMediaBox().getHeight()
                                                - (rowIndex + 1) * cellHeight;
                                contentStream.addRect(borderX, borderY, cellWidth, cellHeight);
                                contentStream.stroke();
                            }
                        }
                    } // contentStream is automatically closed here
                }

                // If any source page is rotated, skip form copying/transformation entirely
                boolean hasRotation = GeneralFormCopyUtils.hasAnyRotatedPage(sourceDocument);
                if (hasRotation) {
                    log.info("Source document has rotated pages; skipping form field copying.");
                } else {
                    try {
                        GeneralFormCopyUtils.copyAndTransformFormFields(
                                sourceDocument,
                                newDocument,
                                totalPages,
                                pagesPerSheet,
                                cols,
                                rows,
                                cellWidth,
                                cellHeight);
                    } catch (Exception e) {
                        log.warn("Failed to copy and transform form fields: {}", e.getMessage(), e);
                    }
                }

                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                newDocument.save(baos);
                byte[] result = baos.toByteArray();
                return WebResponseUtils.bytesToWebResponse(
                        result,
                        GeneralUtils.generateFilename(
                                file.getOriginalFilename(), "_multi_page_layout.pdf"));
            } // newDocument is closed here
        } // sourceDocument is closed here
    }
}
