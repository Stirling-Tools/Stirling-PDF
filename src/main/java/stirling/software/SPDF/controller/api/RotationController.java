package stirling.software.SPDF.controller.api;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
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

import stirling.software.SPDF.model.api.general.RotatePDFRequest;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/general")
@Tag(name = "General", description = "General APIs")
@RequiredArgsConstructor
public class RotationController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(consumes = "multipart/form-data", value = "/rotate-pdf")
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
            throw new IllegalArgumentException("Angle must be a multiple of 90");
        }

        // Load the PDF document
        PDDocument document = pdfDocumentFactory.load(request);

        // Get the list of pages in the document
        PDPageTree pages = document.getPages();

        for (PDPage page : pages) {
            page.setRotation(page.getRotation() + angle);
        }

        return WebResponseUtils.pdfDocToWebResponse(
                document,
                Filenames.toSimpleFileName(pdfFile.getOriginalFilename())
                                .replaceFirst("[.][^.]+$", "")
                        + "_rotated.pdf");
    }
}
