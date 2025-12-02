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
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.general.MergeMultiplePagesRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.FormUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/general")
@Tag(name = "General", description = "General APIs")
@RequiredArgsConstructor
@Slf4j
public class MultiPageLayoutController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(value = "/multi-page-layout", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Merge multiple pages of a PDF document into a single page",
            description =
                    "This operation takes an input PDF file and the number of pages to merge into a"
                            + " single sheet in the output PDF file. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> mergeMultiplePagesIntoOne(
            @ModelAttribute MergeMultiplePagesRequest request) throws IOException {

        int MAX_PAGES = 100000;
        int MAX_COLS = 300;
        int MAX_ROWS = 300;

        String mode = request.getMode();
        if (mode == null || mode.trim().isEmpty()) {
            mode = "DEFAULT";
        }

        int rows;
        int cols;
        int pagesPerSheet;
        switch (mode) {
            case "DEFAULT":
                pagesPerSheet = request.getPagesPerSheet();
                if (pagesPerSheet != 2
                        && pagesPerSheet != 3
                        && pagesPerSheet
                                != (int) Math.sqrt(pagesPerSheet) * Math.sqrt(pagesPerSheet)) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.invalidFormat",
                            "Invalid {0} format: {1}",
                            "pagesPerSheet",
                            "must be 2, 3 or a perfect square");
                }

                cols =
                        pagesPerSheet == 2 || pagesPerSheet == 3
                                ? pagesPerSheet
                                : (int) Math.sqrt(pagesPerSheet);
                rows =
                        pagesPerSheet == 2 || pagesPerSheet == 3
                                ? 1
                                : (int) Math.sqrt(pagesPerSheet);
                break;
            case "CUSTOM":
                rows = request.getRows();
                cols = request.getCols();
                if (rows <= 0 || cols <= 0) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.invalidFormat",
                            "Invalid {0} format: {1}",
                            "rows and cols",
                            "only strictly positive values are allowed");
                }
                pagesPerSheet = cols * rows;
                break;
            default:
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.invalidFormat",
                        "Invalid {0} format: {1}",
                        "mode",
                        "only 'DEFAULT' and 'CUSTOM' are supported");
        }

        if (pagesPerSheet > MAX_PAGES) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument",
                    "Invalid {0} format: {1}",
                    "pagesPerSheet",
                    "must be less than " + MAX_PAGES);
        }
        if (cols > MAX_COLS) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument",
                    "Invalid {0} format: {1}",
                    "cols",
                    "must be less than " + MAX_COLS);
        }
        if (rows > MAX_ROWS) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument",
                    "Invalid {0} format: {1}",
                    "rows",
                    "must be less than " + MAX_ROWS);
        }

        MultipartFile file = request.getFileInput();
        String orientation = request.getOrientation();
        if (orientation == null || orientation.trim().isEmpty()) {
            orientation = "PORTRAIT";
        }
        if (!"PORTRAIT".equals(orientation) && !"LANDSCAPE".equals(orientation)) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidFormat",
                    "Invalid {0} format: {1}",
                    "orientation",
                    "only 'PORTRAIT' and 'LANDSCAPE' are supported");
        }
        String pageOrder = request.getPageOrder();
        if (pageOrder == null || pageOrder.trim().isEmpty()) {
            pageOrder = "LR_TD";
        }

        boolean addBorder = Boolean.TRUE.equals(request.getAddBorder());

        PDDocument sourceDocument = pdfDocumentFactory.load(file);
        PDDocument newDocument =
                pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDocument);

        // Create a new A4 landscape rectangle that we use when orientation is landscape
        PDRectangle a4Landscape =
                new PDRectangle(PDRectangle.A4.getHeight(), PDRectangle.A4.getWidth());
        PDPage newPage =
                "PORTRAIT".equals(orientation)
                        ? new PDPage(PDRectangle.A4)
                        : new PDPage(a4Landscape);
        newDocument.addPage(newPage);

        int totalPages = sourceDocument.getNumberOfPages();
        float cellWidth = newPage.getMediaBox().getWidth() / cols;
        float cellHeight = newPage.getMediaBox().getHeight() / rows;

        PDPageContentStream contentStream =
                new PDPageContentStream(
                        newDocument, newPage, PDPageContentStream.AppendMode.APPEND, true, true);
        LayerUtility layerUtility = new LayerUtility(newDocument);

        float borderThickness = 1.5f; // Specify border thickness as required
        contentStream.setLineWidth(borderThickness);
        contentStream.setStrokingColor(Color.BLACK);

        for (int i = 0; i < totalPages; i++) {
            if (i != 0 && i % pagesPerSheet == 0) {
                // Close the current content stream and create a new page and content stream
                contentStream.close();
                newPage =
                        "PORTRAIT".equals(orientation)
                                ? new PDPage(PDRectangle.A4)
                                : new PDPage(a4Landscape);
                newDocument.addPage(newPage);
                contentStream =
                        new PDPageContentStream(
                                newDocument,
                                newPage,
                                PDPageContentStream.AppendMode.APPEND,
                                true,
                                true);
            }

            PDPage sourcePage = sourceDocument.getPage(i);
            PDRectangle rect = sourcePage.getMediaBox();
            float scaleWidth = cellWidth / rect.getWidth();
            float scaleHeight = cellHeight / rect.getHeight();
            float scale = Math.min(scaleWidth, scaleHeight);

            int adjustedPageIndex =
                    i % pagesPerSheet; // Close the current content stream and create a new
            // page and content stream
            int rowIndex;
            int colIndex;

            switch (pageOrder) {
                case "LR_TD": // Left→Right, then Top→Down
                    rowIndex = adjustedPageIndex / cols;
                    colIndex = adjustedPageIndex % cols;
                    break;

                case "RL_TD": // Right→Left, then Top→Down
                    rowIndex = adjustedPageIndex / cols;
                    colIndex = cols - 1 - (adjustedPageIndex % cols);
                    break;

                case "TD_LR": // Top→Down, then Left→Right
                    colIndex = adjustedPageIndex / rows;
                    rowIndex = adjustedPageIndex % rows;
                    break;

                case "TD_RL": // Top→Down, then Right→Left
                    colIndex = cols - 1 - (adjustedPageIndex / rows);
                    rowIndex = adjustedPageIndex % rows;
                    break;
                default:
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.invalidFormat",
                            "Invalid {0} format: {1}",
                            "pageOrder",
                            "only 'LR_TD', 'RL_TD', 'TD_LR', and 'TD_RL' are supported");
            }

            float x = colIndex * cellWidth + (cellWidth - rect.getWidth() * scale) / 2;
            float y =
                    newPage.getMediaBox().getHeight()
                            - ((rowIndex + 1) * cellHeight
                                    - (cellHeight - rect.getHeight() * scale) / 2);

            contentStream.saveGraphicsState();
            contentStream.transform(Matrix.getTranslateInstance(x, y));
            contentStream.transform(Matrix.getScaleInstance(scale, scale));

            PDFormXObject formXObject = layerUtility.importPageAsForm(sourceDocument, i);
            contentStream.drawForm(formXObject);

            contentStream.restoreGraphicsState();

            if (addBorder) {
                // Draw border around each page
                float borderX = colIndex * cellWidth;
                float borderY = newPage.getMediaBox().getHeight() - (rowIndex + 1) * cellHeight;
                contentStream.addRect(borderX, borderY, cellWidth, cellHeight);
                contentStream.stroke();
            }
        }

        contentStream.close();

        // If any source page is rotated, skip form copying/transformation entirely
        boolean hasRotation = FormUtils.hasAnyRotatedPage(sourceDocument);
        if (hasRotation || "LANDSCAPE".equals(orientation)) {
            log.info("Source document has rotated pages; skipping form field copying.");
        } else {
            try {
                FormUtils.copyAndTransformFormFields(
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

        sourceDocument.close();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        newDocument.save(baos);
        newDocument.close();

        byte[] result = baos.toByteArray();
        return WebResponseUtils.bytesToWebResponse(
                result,
                GeneralUtils.generateFilename(
                        file.getOriginalFilename(), "_multi_page_layout.pdf"));
    }
}
