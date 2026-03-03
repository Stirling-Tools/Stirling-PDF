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

        // Validate the angle
        validateAngleMultipleOf90(angle);

        // Load PDF (via wrapper to allow stubbing)
        try (PDDocument document = loadDocument(request)) {

            PDPageTree pages = document.getPages();

            for (PDPage page : pages) {
                page.setRotation(page.getRotation() + angle);
            }

            // Build response (via wrapper to allow stubbing)
            String outName =
                    GeneralUtils.generateFilename(pdfFile.getOriginalFilename(), "_rotated.pdf");
            return respondPdf(document, outName);
        }
    }

    // Added by Dazhi Wang
    protected PDDocument loadDocument(RotatePDFRequest request) throws IOException {
        return pdfDocumentFactory.load(request);
    }

    protected ResponseEntity<byte[]> respondPdf(PDDocument document, String filename)
            throws IOException {
        return WebResponseUtils.pdfDocToWebResponse(document, filename);
    }

    static void validateAngleMultipleOf90(int angle) {
        if (angle % 90 != 0) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.angleNotMultipleOf90", "Angle must be a multiple of 90");
        }
    }
}
