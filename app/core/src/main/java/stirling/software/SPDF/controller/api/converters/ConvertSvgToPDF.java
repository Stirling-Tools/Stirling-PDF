package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.converters.SvgToPdfRequest;
import stirling.software.SPDF.utils.SvgToPdf;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.SvgSanitizer;
import stirling.software.common.util.WebResponseUtils;

/**
 * Controller for converting SVG (Scalable Vector Graphics) files to PDF.
 *
 * <p>This endpoint uses Apache Batik for SVG rendering and PDFBox with the pdfbox-graphics2d bridge
 * to preserve vector graphics in the resulting PDF. Unlike rasterization approaches, this maintains
 * crisp graphics at any zoom level.
 *
 * <p>Security: SVG files are sanitized to remove potential XSS attacks including script elements,
 * event handlers, and dangerous URL references.
 */
@ConvertApi
@Slf4j
@RequiredArgsConstructor
public class ConvertSvgToPDF {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final SvgSanitizer svgSanitizer;

    @AutoJobPostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/svg/pdf")
    @StandardPdfResponse
    @Operation(
            summary = "Convert SVG to PDF",
            description =
                    "This endpoint converts an SVG (Scalable Vector Graphics) file to PDF format. "
                            + "The conversion preserves vector graphics for crisp output at any resolution. "
                            + "SVG content is sanitized to prevent XSS attacks. "
                            + "Input: SVG file, Output: PDF file. Type: SISO")
    public ResponseEntity<byte[]> convertSvgToPdf(@ModelAttribute SvgToPdfRequest request) {

        MultipartFile inputFile = request.getFileInput();

        // Validate input
        if (inputFile == null || inputFile.isEmpty()) {
            log.error("No file provided for SVG to PDF conversion.");
            return ResponseEntity.badRequest()
                    .body("No file provided".getBytes(StandardCharsets.UTF_8));
        }

        String originalFilename = inputFile.getOriginalFilename();
        if (originalFilename == null || originalFilename.trim().isEmpty()) {
            log.error("Filename is null or empty.");
            return ResponseEntity.badRequest()
                    .body("Please provide a valid filename".getBytes(StandardCharsets.UTF_8));
        }

        // Validate file type
        String lowerFilename = originalFilename.toLowerCase(Locale.ROOT);
        if (!lowerFilename.endsWith(".svg")) {
            log.error("Invalid file type for SVG to PDF: {}", originalFilename);
            return ResponseEntity.badRequest()
                    .body("Please upload a valid SVG file".getBytes(StandardCharsets.UTF_8));
        }

        String baseFilename = Filenames.toSimpleFileName(originalFilename);

        try {
            byte[] fileBytes = inputFile.getBytes();

            // Sanitize SVG to prevent XSS attacks
            byte[] sanitizedBytes;
            try {
                sanitizedBytes = svgSanitizer.sanitize(fileBytes);
            } catch (IOException e) {
                log.error("SVG sanitization failed for {}: {}", originalFilename, e.getMessage());
                return ResponseEntity.badRequest()
                        .body(
                                ("Invalid SVG file: " + e.getMessage())
                                        .getBytes(StandardCharsets.UTF_8));
            }

            // Convert SVG to PDF
            byte[] pdfBytes = SvgToPdf.convert(sanitizedBytes);

            if (pdfBytes == null || pdfBytes.length == 0) {
                log.error("PDF conversion failed - empty output for {}", originalFilename);
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(
                                "PDF conversion failed - empty output"
                                        .getBytes(StandardCharsets.UTF_8));
            }

            // Apply standard PDF processing (metadata, etc.)
            pdfBytes = pdfDocumentFactory.createNewBytesBasedOnOldDocument(pdfBytes);

            log.info("Successfully converted SVG to PDF: {}", originalFilename);

            String outputFilename = GeneralUtils.generateFilename(baseFilename, ".pdf");
            return WebResponseUtils.bytesToWebResponse(
                    pdfBytes, outputFilename, MediaType.APPLICATION_PDF);

        } catch (IOException e) {
            log.error("File processing error for SVG to PDF: {}", originalFilename, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(
                            ("Conversion failed: " + e.getMessage())
                                    .getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            log.error("Unexpected error during SVG to PDF conversion: {}", originalFilename, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(
                            "An unexpected error occurred during conversion"
                                    .getBytes(StandardCharsets.UTF_8));
        }
    }
}
