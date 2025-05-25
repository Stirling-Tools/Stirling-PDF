package stirling.software.SPDF.controller.api;

import java.awt.*;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.apache.pdfbox.multipdf.LayerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.util.Matrix;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.api.general.MergeMultiplePagesRequest;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/general")
@Tag(name = "General", description = "General APIs")
@RequiredArgsConstructor
public class MultiPageLayoutController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(value = "/multi-page-layout", consumes = "multipart/form-data")
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
            throw new IllegalArgumentException("pagesPerSheet must be 2, 3 or a perfect square");
        }

        int cols =
                pagesPerSheet == 2 || pagesPerSheet == 3
                        ? pagesPerSheet
                        : (int) Math.sqrt(pagesPerSheet);
        int rows = pagesPerSheet == 2 || pagesPerSheet == 3 ? 1 : (int) Math.sqrt(pagesPerSheet);

        PDDocument sourceDocument = pdfDocumentFactory.load(file);
        PDDocument newDocument =
                pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDocument);
        PDPage newPage = new PDPage(PDRectangle.A4);
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
                newPage = new PDPage(PDRectangle.A4);
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
                    i % pagesPerSheet; // This will reset the index for every new page
            int rowIndex = adjustedPageIndex / cols;
            int colIndex = adjustedPageIndex % cols;

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

        contentStream.close(); // Close the final content stream
        sourceDocument.close();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        newDocument.save(baos);
        newDocument.close();

        byte[] result = baos.toByteArray();
        return WebResponseUtils.bytesToWebResponse(
                result,
                Filenames.toSimpleFileName(file.getOriginalFilename()).replaceFirst("[.][^.]+$", "")
                        + "_layoutChanged.pdf");
    }
}
