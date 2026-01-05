package stirling.software.SPDF.controller.api;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
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
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.WebResponseUtils;

@GeneralApi
@RequiredArgsConstructor
public class RotationController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @AutoJobPostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/rotate-pdf")
    @StandardPdfResponse
    @Operation(
            summary = "Rotate a PDF file",
            description =
                    "This endpoint rotates a given PDF file by a specified angle. The angle must be"
                            + " a multiple of 90. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> rotatePDF(@ModelAttribute RotatePDFRequest request)
            throws IOException {
        MultipartFile pdfFile = request.getFileInput();
        Integer angle = request.getAngle();

        // Validate the angle is a multiple of 90
        if (angle % 90 != 0) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.angleNotMultipleOf90", "Angle must be a multiple of 90");
        }

        // Load the PDF document with proper resource management
        try (PDDocument document = pdfDocumentFactory.load(request)) {

            // Get the list of pages in the document
            PDPageTree pages = document.getPages();

            for (PDPage page : pages) {
                page.setRotation(page.getRotation() + angle);
            }

            // Return the rotated PDF as a response
            return WebResponseUtils.pdfDocToWebResponse(
                    document,
                    GeneralUtils.generateFilename(pdfFile.getOriginalFilename(), "_rotated.pdf"));
        }
    }
}
