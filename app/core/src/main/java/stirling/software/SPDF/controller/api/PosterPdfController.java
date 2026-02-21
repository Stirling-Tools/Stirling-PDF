package stirling.software.SPDF.controller.api;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

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

import stirling.software.SPDF.config.swagger.MultiFileResponse;
import stirling.software.SPDF.model.api.general.PosterPdfRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.WebResponseUtils;

@GeneralApi
@Slf4j
@RequiredArgsConstructor
public class PosterPdfController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @AutoJobPostMapping(
            value = "/split-for-poster-print",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @MultiFileResponse
    @Operation(
            summary = "Split large PDF pages into smaller printable chunks",
            description =
                    "This endpoint splits large or oddly-sized PDF pages into smaller chunks "
                            + "suitable for printing on standard paper sizes (e.g., A4, Letter). "
                            + "Divides each page into a grid of smaller pages using Apache PDFBox. "
                            + "Input: PDF Output: ZIP-PDF Type: SISO")
    public ResponseEntity<byte[]> posterPdf(@ModelAttribute PosterPdfRequest request)
            throws Exception {

        log.debug("Starting PDF poster split process with request: {}", request);
        MultipartFile file = request.getFileInput();

        String filename = GeneralUtils.generateFilename(file.getOriginalFilename(), "");
        log.debug("Base filename for output: {}", filename);

        try (PDDocument sourceDocument = pdfDocumentFactory.load(file);
                PDDocument outputDocument =
                        pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDocument);
                ByteArrayOutputStream pdfOutputStream = new ByteArrayOutputStream();
                ByteArrayOutputStream zipOutputStream = new ByteArrayOutputStream()) {

            // Get target page size
            PDRectangle targetPageSize = getTargetPageSize(request.getPageSize());
            log.debug(
                    "Target page size: {} ({}x{})",
                    request.getPageSize(),
                    targetPageSize.getWidth(),
                    targetPageSize.getHeight());

            // Create LayerUtility for importing pages as forms
            LayerUtility layerUtility = new LayerUtility(outputDocument);

            int totalPages = sourceDocument.getNumberOfPages();
            int xFactor = request.getXFactor();
            int yFactor = request.getYFactor();
            boolean rightToLeft = request.isRightToLeft();

            log.debug(
                    "Processing {} pages with grid {}x{}, RTL={}",
                    totalPages,
                    xFactor,
                    yFactor,
                    rightToLeft);

            // Process each page
            for (int pageIndex = 0; pageIndex < totalPages; pageIndex++) {
                PDPage sourcePage = sourceDocument.getPage(pageIndex);

                // Get both MediaBox and CropBox
                PDRectangle mediaBox = sourcePage.getMediaBox();
                PDRectangle cropBox = sourcePage.getCropBox();

                // If no CropBox is set, use MediaBox
                if (cropBox == null) {
                    cropBox = mediaBox;
                }

                // Save original boxes for restoration
                PDRectangle originalMediaBox = sourcePage.getMediaBox();
                PDRectangle originalCropBox = sourcePage.getCropBox();

                // Normalize the page: set MediaBox to CropBox
                // This ensures the form's coordinate space starts at (0, 0)
                // instead of having an offset from the original MediaBox
                sourcePage.setMediaBox(cropBox);
                sourcePage.setCropBox(cropBox);

                // Handle page rotation
                int rotation = sourcePage.getRotation();
                float sourceWidth = cropBox.getWidth();
                float sourceHeight = cropBox.getHeight();

                // Swap dimensions if rotated 90 or 270 degrees
                if (rotation == 90 || rotation == 270) {
                    float temp = sourceWidth;
                    sourceWidth = sourceHeight;
                    sourceHeight = temp;
                }

                log.debug(
                        "Page {}: Normalized to CropBox dimensions {}x{}, rotation {}",
                        pageIndex,
                        sourceWidth,
                        sourceHeight,
                        rotation);

                // Import source page as form (now with normalized coordinate space)
                PDFormXObject form = layerUtility.importPageAsForm(sourceDocument, pageIndex);

                // Restore original boxes
                sourcePage.setMediaBox(originalMediaBox);
                sourcePage.setCropBox(originalCropBox);

                // Calculate cell dimensions in source page coordinates
                float cellWidth = sourceWidth / xFactor;
                float cellHeight = sourceHeight / yFactor;

                // Create grid cells (rows × columns)
                for (int row = 0; row < yFactor; row++) {
                    for (int col = 0; col < xFactor; col++) {
                        // Apply RTL ordering for columns if enabled
                        int actualCol = rightToLeft ? (xFactor - 1 - col) : col;

                        // Calculate crop rectangle in source coordinates
                        // PDF coordinates start at bottom-left
                        float cropX = actualCol * cellWidth;
                        // For Y: invert so row 0 shows TOP (following SplitPdfBySectionsController
                        // pattern)
                        float cropY = (yFactor - 1 - row) * cellHeight;

                        // Create new output page with target size
                        PDPage outputPage = new PDPage(targetPageSize);
                        outputDocument.addPage(outputPage);

                        try (PDPageContentStream contentStream =
                                new PDPageContentStream(
                                        outputDocument,
                                        outputPage,
                                        PDPageContentStream.AppendMode.APPEND,
                                        true,
                                        true)) {

                            // Calculate uniform scale to fit cell into target page
                            // Scale UP if cell is smaller than target, scale DOWN if larger
                            float scaleX = targetPageSize.getWidth() / cellWidth;
                            float scaleY = targetPageSize.getHeight() / cellHeight;
                            float scale = Math.min(scaleX, scaleY);

                            // Center the scaled content on the target page
                            float scaledCellWidth = cellWidth * scale;
                            float scaledCellHeight = cellHeight * scale;
                            float offsetX = (targetPageSize.getWidth() - scaledCellWidth) / 2;
                            float offsetY = (targetPageSize.getHeight() - scaledCellHeight) / 2;

                            // Apply transformations
                            contentStream.saveGraphicsState();

                            // Translate to center position
                            contentStream.transform(Matrix.getTranslateInstance(offsetX, offsetY));

                            // Scale uniformly
                            contentStream.transform(Matrix.getScaleInstance(scale, scale));

                            // Translate to show only the desired grid cell
                            // IMPORTANT: The PDFormXObject's BBox already matches the CropBox
                            // (including its offset), so we only need to translate by cropX/cropY
                            // relative to the CropBox origin, NOT the MediaBox origin
                            contentStream.transform(Matrix.getTranslateInstance(-cropX, -cropY));

                            // Draw the form
                            contentStream.drawForm(form);

                            contentStream.restoreGraphicsState();
                        }

                        log.trace(
                                "Created output page for grid cell [{},{}] of page {}: cropX={}, cropY={}, translate=({}, {})",
                                row,
                                actualCol,
                                pageIndex,
                                cropX,
                                cropY,
                                -cropX,
                                -cropY);
                    }
                }
            }

            // Save output PDF
            outputDocument.save(pdfOutputStream);
            byte[] pdfData = pdfOutputStream.toByteArray();

            log.debug(
                    "Generated output PDF with {} pages ({} bytes)",
                    outputDocument.getNumberOfPages(),
                    pdfData.length);

            // Create ZIP file with the result
            try (ZipOutputStream zipOut = new ZipOutputStream(zipOutputStream)) {
                ZipEntry zipEntry = new ZipEntry(filename + "_poster.pdf");
                zipOut.putNextEntry(zipEntry);
                zipOut.write(pdfData);
                zipOut.closeEntry();
            }

            byte[] zipData = zipOutputStream.toByteArray();
            log.debug("Successfully created ZIP with {} bytes", zipData.length);

            return WebResponseUtils.bytesToWebResponse(
                    zipData, filename + "_poster.zip", MediaType.APPLICATION_OCTET_STREAM);

        } catch (IOException e) {
            ExceptionUtils.logException("PDF poster split process", e);
            throw e;
        }
    }

    /**
     * Maps page size string to PDRectangle.
     *
     * @param pageSize the page size name (e.g., "A4", "Letter")
     * @return the corresponding PDRectangle
     * @throws IllegalArgumentException if page size is not supported
     */
    private PDRectangle getTargetPageSize(String pageSize) {
        Map<String, PDRectangle> sizeMap = new HashMap<>();
        sizeMap.put("A4", PDRectangle.A4);
        sizeMap.put("Letter", PDRectangle.LETTER);
        sizeMap.put("A3", PDRectangle.A3);
        sizeMap.put("A5", PDRectangle.A5);
        sizeMap.put("Legal", PDRectangle.LEGAL);
        sizeMap.put("Tabloid", new PDRectangle(792, 1224)); // 11x17 inches

        PDRectangle size = sizeMap.get(pageSize);
        if (size == null) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidPageSize",
                    "Invalid page size: {0}",
                    pageSize,
                    String.join(", ", sizeMap.keySet()));
        }
        return size;
    }
}
