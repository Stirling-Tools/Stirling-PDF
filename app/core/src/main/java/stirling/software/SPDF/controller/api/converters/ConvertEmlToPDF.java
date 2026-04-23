package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Locale;

import org.jetbrains.annotations.NotNull;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.util.HtmlUtils;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.api.converters.EmlToPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.CustomHtmlSanitizer;
import stirling.software.common.util.EmlToPdf;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ConvertApi
@Slf4j
@RequiredArgsConstructor
public class ConvertEmlToPDF {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final RuntimePathConfig runtimePathConfig;
    private final TempFileManager tempFileManager;
    private final CustomHtmlSanitizer customHtmlSanitizer;

    @AutoJobPostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/eml/pdf")
    @StandardPdfResponse
    @Operation(
            summary = "Convert EML/MSG to PDF",
            description =
                    "This endpoint converts EML (email) and MSG (Outlook) files to PDF format"
                            + " with extensive customization options. Features include font settings,"
                            + " image constraints, display modes, attachment handling, and HTML debug"
                            + " output. Input: EML or MSG file, Output: PDF or HTML file. Type: SISO")
    public ResponseEntity<Resource> convertEmlToPdf(@ModelAttribute EmlToPdfRequest request) {

        MultipartFile inputFile = request.getFileInput();
        String originalFilename = inputFile.getOriginalFilename();

        // Validate input
        if (inputFile.isEmpty()) {
            log.error("No file provided for EML/MSG to PDF conversion.");
            return errorResponse(HttpStatus.BAD_REQUEST, "No file provided");
        }

        if (originalFilename == null || originalFilename.trim().isEmpty()) {
            log.error("Filename is null or empty.");
            return errorResponse(HttpStatus.BAD_REQUEST, "Please provide a valid filename");
        }

        // Validate file type - support EML and MSG (Outlook) files
        String lowerFilename = originalFilename.toLowerCase(Locale.ROOT);
        if (!lowerFilename.endsWith(".eml") && !lowerFilename.endsWith(".msg")) {
            log.error("Invalid file type for EML/MSG to PDF: {}", originalFilename);
            return errorResponse(HttpStatus.BAD_REQUEST, "Please upload a valid EML or MSG file");
        }

        String baseFilename = Filenames.toSimpleFileName(originalFilename); // Use Filenames utility

        try {
            byte[] fileBytes = inputFile.getBytes();

            if (request.isDownloadHtml()) {
                try {
                    String htmlContent =
                            EmlToPdf.convertEmlToHtml(fileBytes, request, customHtmlSanitizer);
                    log.info("Successfully converted email to HTML: {}", originalFilename);
                    TempFile tempOut = tempFileManager.createManagedTempFile(".html");
                    try {
                        Files.writeString(tempOut.getPath(), htmlContent, StandardCharsets.UTF_8);
                    } catch (Exception ex) {
                        tempOut.close();
                        throw ex;
                    }
                    return WebResponseUtils.fileToWebResponse(
                            tempOut, baseFilename + ".html", MediaType.TEXT_HTML);
                } catch (IOException | IllegalArgumentException e) {
                    log.error("HTML conversion failed for {}", originalFilename, e);
                    return errorResponse(
                            HttpStatus.INTERNAL_SERVER_ERROR,
                            "HTML conversion failed: " + e.getMessage());
                }
            }

            // Convert EML/MSG to PDF with enhanced options
            try {
                byte[] pdfBytes =
                        EmlToPdf.convertEmlToPdf(
                                runtimePathConfig.getWeasyPrintPath(),
                                request,
                                fileBytes,
                                originalFilename,
                                pdfDocumentFactory,
                                tempFileManager,
                                customHtmlSanitizer);

                if (pdfBytes == null || pdfBytes.length == 0) {
                    log.error("PDF conversion failed - empty output for {}", originalFilename);
                    return errorResponse(
                            HttpStatus.INTERNAL_SERVER_ERROR,
                            "PDF conversion failed - empty output");
                }
                log.info("Successfully converted email to PDF: {}", originalFilename);
                TempFile tempOut = tempFileManager.createManagedTempFile(".pdf");
                try {
                    Files.write(tempOut.getPath(), pdfBytes);
                } catch (Exception ex) {
                    tempOut.close();
                    throw ex;
                }
                return WebResponseUtils.pdfFileToWebResponse(tempOut, baseFilename + ".pdf");

            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                log.error("Email to PDF conversion was interrupted for {}", originalFilename, e);
                return errorResponse(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Conversion was interrupted");
            } catch (IllegalArgumentException e) {
                String errorMessage = buildErrorMessage(e, originalFilename);
                log.error(
                        "Email to PDF conversion failed for {}: {}",
                        originalFilename,
                        errorMessage,
                        e);
                return errorResponse(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage);
            } catch (RuntimeException e) {
                String errorMessage = buildErrorMessage(e, originalFilename);
                log.error(
                        "Email to PDF conversion failed for {}: {}",
                        originalFilename,
                        errorMessage,
                        e);
                return errorResponse(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage);
            }

        } catch (IOException e) {
            log.error("File processing error for email to PDF: {}", originalFilename, e);
            return errorResponse(HttpStatus.INTERNAL_SERVER_ERROR, "File processing error");
        }
    }

    private ResponseEntity<Resource> errorResponse(HttpStatus status, String message) {
        byte[] body = message.getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.status(status)
                .contentLength(body.length)
                .body(new ByteArrayResource(body));
    }

    private static @NotNull String buildErrorMessage(Exception e, String originalFilename) {
        String safeFilename = HtmlUtils.htmlEscape(originalFilename);
        String exceptionMessage = e.getMessage();
        String safeExceptionMessage =
                exceptionMessage == null ? "Unknown error" : HtmlUtils.htmlEscape(exceptionMessage);
        String errorMessage;
        if (exceptionMessage != null && exceptionMessage.contains("Invalid EML")) {
            errorMessage =
                    "Invalid EML file format. Please ensure you've uploaded a valid email"
                            + " file ("
                            + safeFilename
                            + ").";
        } else if (exceptionMessage != null && exceptionMessage.contains("WeasyPrint")) {
            errorMessage =
                    "PDF generation failed for "
                            + safeFilename
                            + ". This may be due to complex email formatting.";
        } else {
            errorMessage = "Conversion failed for " + safeFilename + ": " + safeExceptionMessage;
        }
        return errorMessage;
    }
}
