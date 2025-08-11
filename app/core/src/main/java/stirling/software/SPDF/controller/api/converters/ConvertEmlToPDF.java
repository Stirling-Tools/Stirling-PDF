package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.jetbrains.annotations.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.api.converters.EmlToPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.CustomHtmlSanitizer;
import stirling.software.common.util.EmlToPdf;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/convert")
@Tag(name = "Convert", description = "Convert APIs")
@Slf4j
@RequiredArgsConstructor
public class ConvertEmlToPDF {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final RuntimePathConfig runtimePathConfig;
    private final TempFileManager tempFileManager;
    private final CustomHtmlSanitizer customHtmlSanitizer;

    @PostMapping(consumes = "multipart/form-data", value = "/eml/pdf")
    @Operation(
            summary = "Convert EML to PDF",
            description =
                    "This endpoint converts EML (email) files to PDF format with extensive"
                            + " customization options. Features include font settings, image constraints, display modes, attachment handling,"
                            + " and HTML debug output. Input: EML file, Output: PDF"
                            + " or HTML file. Type: SISO")
    public ResponseEntity<byte[]> convertEmlToPdf(@ModelAttribute EmlToPdfRequest request) {

        MultipartFile inputFile = request.getFileInput();
        String originalFilename = inputFile.getOriginalFilename();

        // Validate input
        if (inputFile.isEmpty()) {
            log.error("No file provided for EML to PDF conversion.");
            return ResponseEntity.badRequest()
                    .body("No file provided".getBytes(StandardCharsets.UTF_8));
        }

        if (originalFilename == null || originalFilename.trim().isEmpty()) {
            log.error("Filename is null or empty.");
            return ResponseEntity.badRequest()
                    .body("Please provide a valid filename".getBytes(StandardCharsets.UTF_8));
        }

        // Validate file type - support EML
        String lowerFilename = originalFilename.toLowerCase();
        if (!lowerFilename.endsWith(".eml")) {
            log.error("Invalid file type for EML to PDF: {}", originalFilename);
            return ResponseEntity.badRequest()
                    .body("Please upload a valid EML file".getBytes(StandardCharsets.UTF_8));
        }

        String baseFilename = Filenames.toSimpleFileName(originalFilename); // Use Filenames utility

        try {
            byte[] fileBytes = inputFile.getBytes();

            if (request.isDownloadHtml()) {
                try {
                    String htmlContent = EmlToPdf.convertEmlToHtml(fileBytes, request);
                    log.info("Successfully converted EML to HTML: {}", originalFilename);
                    return WebResponseUtils.bytesToWebResponse(
                            htmlContent.getBytes(StandardCharsets.UTF_8),
                            baseFilename + ".html",
                            MediaType.TEXT_HTML);
                } catch (IOException | IllegalArgumentException e) {
                    log.error("HTML conversion failed for {}", originalFilename, e);
                    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                            .body(
                                    ("HTML conversion failed: " + e.getMessage())
                                            .getBytes(StandardCharsets.UTF_8));
                }
            }

            // Convert EML to PDF with enhanced options
            try {
                byte[] pdfBytes =
                        EmlToPdf.convertEmlToPdf(
                                runtimePathConfig
                                        .getWeasyPrintPath(), // Use configured WeasyPrint path
                                request,
                                fileBytes,
                                originalFilename,
                                pdfDocumentFactory,
                                tempFileManager,
                                customHtmlSanitizer);

                if (pdfBytes == null || pdfBytes.length == 0) {
                    log.error("PDF conversion failed - empty output for {}", originalFilename);
                    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                            .body(
                                    "PDF conversion failed - empty output"
                                            .getBytes(StandardCharsets.UTF_8));
                }
                log.info("Successfully converted EML to PDF: {}", originalFilename);
                return WebResponseUtils.bytesToWebResponse(
                        pdfBytes, baseFilename + ".pdf", MediaType.APPLICATION_PDF);

            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                log.error("EML to PDF conversion was interrupted for {}", originalFilename, e);
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body("Conversion was interrupted".getBytes(StandardCharsets.UTF_8));
            } catch (IllegalArgumentException e) {
                String errorMessage = buildErrorMessage(e, originalFilename);
                log.error(
                        "EML to PDF conversion failed for {}: {}",
                        originalFilename,
                        errorMessage,
                        e);
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(errorMessage.getBytes(StandardCharsets.UTF_8));
            } catch (RuntimeException e) {
                String errorMessage = buildErrorMessage(e, originalFilename);
                log.error(
                        "EML to PDF conversion failed for {}: {}",
                        originalFilename,
                        errorMessage,
                        e);
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(errorMessage.getBytes(StandardCharsets.UTF_8));
            }

        } catch (IOException e) {
            log.error("File processing error for EML to PDF: {}", originalFilename, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("File processing error".getBytes(StandardCharsets.UTF_8));
        }
    }

    private static @NotNull String buildErrorMessage(Exception e, String originalFilename) {
        String errorMessage;
        if (e.getMessage() != null && e.getMessage().contains("Invalid EML")) {
            errorMessage =
                    "Invalid EML file format. Please ensure you've uploaded a valid email"
                            + " file ("
                            + originalFilename
                            + ").";
        } else if (e.getMessage() != null && e.getMessage().contains("WeasyPrint")) {
            errorMessage =
                    "PDF generation failed for "
                            + originalFilename
                            + ". This may be due to complex email formatting.";
        } else {
            errorMessage = "Conversion failed for " + originalFilename + ": " + e.getMessage();
        }
        return errorMessage;
    }
}
