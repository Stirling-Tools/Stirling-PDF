package stirling.software.SPDF.controller.api;

import java.awt.*;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.multipdf.LayerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.util.Matrix;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.general.BookletImpositionRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.WebResponseUtils;

@GeneralApi
@RequiredArgsConstructor
public class BookletImpositionController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @AutoJobPostMapping(value = "/booklet-imposition", consumes = "multipart/form-data")
    @StandardPdfResponse
    @Operation(
            summary = "Create a booklet with proper page imposition",
            description =
                    "This operation combines page reordering for booklet printing with multi-page layout. "
                            + "It rearranges pages in the correct order for booklet printing and places multiple pages "
                            + "on each sheet for proper folding and binding. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> createBookletImposition(
            @ModelAttribute BookletImpositionRequest request) throws IOException {

        MultipartFile file = request.getFileInput();
        String bookletType = request.getBookletType();
        int pagesPerSheet = request.getPagesPerSheet();
        boolean addBorder = Boolean.TRUE.equals(request.getAddBorder());
        String pageOrientation = request.getPageOrientation();

        // Validate pages per sheet for booklet
        if (pagesPerSheet != 2 && pagesPerSheet != 4) {
            throw new IllegalArgumentException(
                    "pagesPerSheet must be 2 or 4 for booklet imposition");
        }

        PDDocument sourceDocument = pdfDocumentFactory.load(file);
        int totalPages = sourceDocument.getNumberOfPages();

        // Step 1: Reorder pages for booklet (reusing logic from RearrangePagesPDFController)
        List<Integer> bookletOrder = getBookletPageOrder(bookletType, totalPages);

        // Step 2: Create new document with multi-page layout (reusing logic from
        // MultiPageLayoutController)
        PDDocument newDocument =
                createBookletWithLayout(
                        sourceDocument, bookletOrder, pagesPerSheet, addBorder, pageOrientation);

        sourceDocument.close();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        newDocument.save(baos);
        newDocument.close();

        byte[] result = baos.toByteArray();
        return WebResponseUtils.bytesToWebResponse(
                result,
                Filenames.toSimpleFileName(file.getOriginalFilename()).replaceFirst("[.][^.]+$", "")
                        + "_booklet.pdf");
    }

    // Reused logic from RearrangePagesPDFController
    private List<Integer> getBookletPageOrder(String bookletType, int totalPages) {
        if ("SIDE_STITCH_BOOKLET".equals(bookletType)) {
            return sideStitchBookletSort(totalPages);
        } else {
            return bookletSort(totalPages);
        }
    }

    private List<Integer> bookletSort(int totalPages) {
        List<Integer> newPageOrder = new ArrayList<>();
        for (int i = 0; i < totalPages / 2; i++) {
            newPageOrder.add(i);
            newPageOrder.add(totalPages - i - 1);
        }
        return newPageOrder;
    }

    private List<Integer> sideStitchBookletSort(int totalPages) {
        List<Integer> newPageOrder = new ArrayList<>();
        for (int i = 0; i < (totalPages + 3) / 4; i++) {
            int begin = i * 4;
            newPageOrder.add(Math.min(begin + 3, totalPages - 1));
            newPageOrder.add(Math.min(begin, totalPages - 1));
            newPageOrder.add(Math.min(begin + 1, totalPages - 1));
            newPageOrder.add(Math.min(begin + 2, totalPages - 1));
        }
        return newPageOrder;
    }

    // Reused and adapted logic from MultiPageLayoutController
    private PDDocument createBookletWithLayout(
            PDDocument sourceDocument,
            List<Integer> pageOrder,
            int pagesPerSheet,
            boolean addBorder,
            String pageOrientation)
            throws IOException {

        PDDocument newDocument =
                pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDocument);

        int cols = pagesPerSheet == 2 ? 2 : 2; // 2x1 for 2 pages, 2x2 for 4 pages
        int rows = pagesPerSheet == 2 ? 1 : 2;

        int currentPageIndex = 0;
        int totalOrderedPages = pageOrder.size();

        while (currentPageIndex < totalOrderedPages) {
            // Use landscape orientation for booklets (A4 landscape -> A5 portrait when folded)
            PDRectangle pageSize =
                    "LANDSCAPE".equals(pageOrientation)
                            ? new PDRectangle(PDRectangle.A4.getHeight(), PDRectangle.A4.getWidth())
                            : PDRectangle.A4;
            PDPage newPage = new PDPage(pageSize);
            newDocument.addPage(newPage);

            float cellWidth = newPage.getMediaBox().getWidth() / cols;
            float cellHeight = newPage.getMediaBox().getHeight() / rows;

            PDPageContentStream contentStream =
                    new PDPageContentStream(
                            newDocument,
                            newPage,
                            PDPageContentStream.AppendMode.APPEND,
                            true,
                            true);
            LayerUtility layerUtility = new LayerUtility(newDocument);

            if (addBorder) {
                contentStream.setLineWidth(1.5f);
                contentStream.setStrokingColor(Color.BLACK);
            }

            // Place pages on the current sheet
            for (int sheetPosition = 0;
                    sheetPosition < pagesPerSheet && currentPageIndex < totalOrderedPages;
                    sheetPosition++) {
                int sourcePageIndex = pageOrder.get(currentPageIndex);
                PDPage sourcePage = sourceDocument.getPage(sourcePageIndex);
                PDRectangle rect = sourcePage.getMediaBox();

                float scaleWidth = cellWidth / rect.getWidth();
                float scaleHeight = cellHeight / rect.getHeight();
                float scale = Math.min(scaleWidth, scaleHeight);

                int rowIndex = sheetPosition / cols;
                int colIndex = sheetPosition % cols;

                float x = colIndex * cellWidth + (cellWidth - rect.getWidth() * scale) / 2;
                float y =
                        newPage.getMediaBox().getHeight()
                                - ((rowIndex + 1) * cellHeight
                                        - (cellHeight - rect.getHeight() * scale) / 2);

                contentStream.saveGraphicsState();
                contentStream.transform(Matrix.getTranslateInstance(x, y));
                contentStream.transform(Matrix.getScaleInstance(scale, scale));

                PDFormXObject formXObject =
                        layerUtility.importPageAsForm(sourceDocument, sourcePageIndex);
                contentStream.drawForm(formXObject);

                contentStream.restoreGraphicsState();

                if (addBorder) {
                    float borderX = colIndex * cellWidth;
                    float borderY = newPage.getMediaBox().getHeight() - (rowIndex + 1) * cellHeight;
                    contentStream.addRect(borderX, borderY, cellWidth, cellHeight);
                    contentStream.stroke();
                }

                currentPageIndex++;
            }

            contentStream.close();
        }

        return newDocument;
    }
}
