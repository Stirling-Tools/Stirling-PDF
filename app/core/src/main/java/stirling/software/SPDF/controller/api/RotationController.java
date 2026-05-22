package stirling.software.SPDF.controller.api;

import java.io.File;
import java.io.IOException;
import java.lang.foreign.MemorySegment;
import java.nio.file.Path;

import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.general.RotatePDFRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfPage;
import stirling.software.jpdfium.doc.PdfPageEditor;

@GeneralApi
@RequiredArgsConstructor
public class RotationController {

    @SuppressWarnings("unused")
    private final CustomPDFDocumentFactory pdfDocumentFactory;

    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/rotate-pdf",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @StandardPdfResponse
    @Operation(
            summary = "Rotate a PDF file",
            description =
                    "This endpoint rotates a given PDF file by a specified angle. The angle must be"
                            + " a multiple of 90. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<Resource> rotatePDF(@ModelAttribute RotatePDFRequest request)
            throws IOException {
        MultipartFile pdfFile = request.getFileInput();
        Integer angle = request.getAngle();

        if (angle % 90 != 0) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.angleNotMultipleOf90", "Angle must be a multiple of 90");
        }

        int delta = Math.floorMod(angle / 90, 4);

        File source = tempFileManager.convertMultipartFileToFile(pdfFile);
        try {
            TempFile outputTempFile = new TempFile(tempFileManager, ".pdf");
            try {
                Path src = source.toPath();
                Path out = outputTempFile.getFile().toPath();
                try (PdfDocument doc = PdfDocument.open(src)) {
                    int pageCount = doc.pageCount();
                    for (int i = 0; i < pageCount; i++) {
                        try (PdfPage page = doc.page(i)) {
                            MemorySegment rawPage = page.rawHandle();
                            int current = PdfPageEditor.getRotation(rawPage);
                            int target = Math.floorMod(current + delta, 4);
                            PdfPageEditor.setRotation(rawPage, target);
                        }
                    }
                    doc.save(out);
                } catch (RuntimeException e) {
                    throw new IOException("JPDFium rotate-pdf failed", e);
                }
                return WebResponseUtils.pdfFileToWebResponse(
                        outputTempFile,
                        GeneralUtils.generateFilename(
                                pdfFile.getOriginalFilename(), "_rotated.pdf"));
            } catch (Exception e) {
                outputTempFile.close();
                throw e;
            }
        } finally {
            tempFileManager.deleteTempFile(source);
        }
    }
}
