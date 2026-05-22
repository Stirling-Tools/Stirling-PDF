package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.lang.foreign.MemorySegment;

import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfPage;
import stirling.software.jpdfium.doc.PdfPageEditor;

@GeneralApi
@Slf4j
@RequiredArgsConstructor
public class RemoveImagesController {

    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/remove-image-pdf",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @Operation(
            summary = "Remove images from PDF",
            description =
                    "This endpoint removes all embedded images from a PDF file and returns the"
                            + " modified document. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<Resource> removeImages(@ModelAttribute PDFFile request)
            throws IOException {

        MultipartFile inputFile = request.getFileInput();

        TempFile inputTemp = new TempFile(tempFileManager, ".pdf");
        try {
            inputFile.transferTo(inputTemp.getFile());

            int imagesRemoved = 0;
            int totalPages;

            try (PdfDocument doc = PdfDocument.open(inputTemp.getPath())) {
                totalPages = doc.pageCount();
                for (int pageIndex = 0; pageIndex < totalPages; pageIndex++) {
                    try (PdfPage page = doc.page(pageIndex)) {
                        imagesRemoved += removeImagesFromPage(page);
                    }
                }

                TempFile tempOut = tempFileManager.createManagedTempFile(".pdf");
                try {
                    doc.save(tempOut.getPath());
                } catch (RuntimeException e) {
                    tempOut.close();
                    throw e;
                }

                log.info("Removed {} images from PDF with {} pages", imagesRemoved, totalPages);

                return WebResponseUtils.pdfFileToWebResponse(
                        tempOut,
                        GeneralUtils.generateFilename(
                                inputFile.getOriginalFilename(), "_images_removed.pdf"));
            }
        } catch (RuntimeException e) {
            throw ExceptionUtils.handlePdfException(new IOException(e), "during image removal");
        } catch (IOException e) {
            throw ExceptionUtils.handlePdfException(e, "during image removal");
        } finally {
            inputTemp.close();
        }
    }

    // Remove all IMAGE-typed page objects from a single page using JPDFium's editor APIs.
    private int removeImagesFromPage(PdfPage page) {
        MemorySegment pageHandle = page.rawHandle();
        int removed = 0;
        // Iterate in reverse so index shifts don't skip elements after removal.
        int count = PdfPageEditor.countObjects(pageHandle);
        for (int i = count - 1; i >= 0; i--) {
            MemorySegment obj = PdfPageEditor.getObject(pageHandle, i);
            if (obj == null) {
                continue;
            }
            int type = PdfPageEditor.getObjectType(obj);
            if (type == PdfPageEditor.PAGEOBJ_IMAGE) {
                if (PdfPageEditor.removeObject(pageHandle, obj)) {
                    removed++;
                }
            }
        }
        if (removed > 0) {
            PdfPageEditor.generateContent(pageHandle);
        }
        return removed;
    }
}
