package stirling.software.SPDF.controller.api;

import java.io.IOException;

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
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.model.SaveOptions;
import stirling.software.jpdfium.transform.PdfPageGeometry;

@GeneralApi
@RequiredArgsConstructor
public class RotationController {

    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/rotate-pdf",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @StandardPdfResponse
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Rotate all pages clockwise by 0, 90, 180 or 270 degrees",
            description =
                    "Adds the angle (a multiple of 90) to every page's rotation. For"
                            + " per-page rotation in automated workflows, use auto-rotate-pdf with"
                            + " pageRotations.")
    public ResponseEntity<Resource> rotatePDF(@ModelAttribute RotatePDFRequest request)
            throws IOException {
        MultipartFile pdfFile = request.getFileInput();
        Integer angle = request.getAngle();

        if (angle == null || angle % 90 != 0) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.angleNotMultipleOf90", "Angle must be a multiple of 90");
        }

        TempFile tempOutputFile = tempFileManager.createManagedTempFile(".pdf");
        try {
            try (PdfDocument document = PdfDocument.open(pdfFile.getBytes())) {
                for (int i = 0; i < document.pageCount(); i++) {
                    int rotation =
                            Math.floorMod(PdfPageGeometry.getRotation(document, i) + angle, 360);
                    PdfPageGeometry.setRotation(document, i, rotation);
                }
                document.saveTo(tempOutputFile.getFile().toPath(), SaveOptions.validated());
            }

            return WebResponseUtils.pdfFileToWebResponse(
                    tempOutputFile,
                    GeneralUtils.generateFilename(pdfFile.getOriginalFilename(), "_rotated.pdf"));
        } catch (IOException e) {
            tempOutputFile.close();
            throw e;
        } catch (RuntimeException | LinkageError e) {
            tempOutputFile.close();
            throw new IOException("JPDFium rotate failed", e);
        }
    }
}
