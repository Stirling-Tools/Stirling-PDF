package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Locale;

import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.jetbrains.annotations.NotNull;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.converters.EmlToPdfRequest;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.CustomHtmlSanitizer;
import stirling.software.common.util.EmlToPdf;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ConvertApi
@Path("/api/v1/convert")
@ApplicationScoped
@Slf4j
@RequiredArgsConstructor
public class ConvertEmlToPDF {

    private static final MediaType TEXT_HTML_TYPE = MediaType.valueOf(MediaType.TEXT_HTML);

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final RuntimePathConfig runtimePathConfig;
    private final TempFileManager tempFileManager;
    private final CustomHtmlSanitizer customHtmlSanitizer;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/eml/pdf",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @POST
    @Path("/eml/pdf")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @StandardPdfResponse
    @Operation(
            summary = "Convert EML/MSG to PDF",
            description =
                    "This endpoint converts EML (email) and MSG (Outlook) files to PDF format"
                            + " with extensive customization options. Features include font settings,"
                            + " image constraints, display modes, attachment handling, and HTML debug"
                            + " output. Input: EML or MSG file, Output: PDF or HTML file. Type: SISO")
    public Response convertEmlToPdf(
            @RestForm("fileInput") FileUpload fileUpload,
            @RestForm("fileId") String fileId,
            @RestForm("includeAttachments") boolean includeAttachments,
            @RestForm("maxAttachmentSizeMB") Integer maxAttachmentSizeMB,
            @RestForm("downloadHtml") boolean downloadHtml,
            @RestForm("includeAllRecipients") Boolean includeAllRecipients) {

        EmlToPdfRequest request = new EmlToPdfRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileUpload));
        request.setFileId(fileId);
        request.setIncludeAttachments(includeAttachments);
        if (maxAttachmentSizeMB != null) {
            request.setMaxAttachmentSizeMB(maxAttachmentSizeMB);
        }
        request.setDownloadHtml(downloadHtml);
        if (includeAllRecipients != null) {
            request.setIncludeAllRecipients(includeAllRecipients);
        }

        var inputFile = request.getFileInput();

        // Validate input
        if (inputFile == null || inputFile.isEmpty()) {
            log.error("No file provided for EML/MSG to PDF conversion.");
            return errorResponse(Response.Status.BAD_REQUEST, "No file provided");
        }

        String originalFilename = inputFile.getOriginalFilename();

        if (originalFilename == null || originalFilename.trim().isEmpty()) {
            log.error("Filename is null or empty.");
            return errorResponse(Response.Status.BAD_REQUEST, "Please provide a valid filename");
        }

        // Validate file type - support EML and MSG (Outlook) files
        String lowerFilename = originalFilename.toLowerCase(Locale.ROOT);
        if (!lowerFilename.endsWith(".eml") && !lowerFilename.endsWith(".msg")) {
            log.error("Invalid file type for EML/MSG to PDF: {}", originalFilename);
            return errorResponse(
                    Response.Status.BAD_REQUEST, "Please upload a valid EML or MSG file");
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
                            tempOut, baseFilename + ".html", TEXT_HTML_TYPE);
                } catch (IOException | IllegalArgumentException e) {
                    log.error("HTML conversion failed for {}", originalFilename, e);
                    return errorResponse(
                            Response.Status.INTERNAL_SERVER_ERROR,
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
                            Response.Status.INTERNAL_SERVER_ERROR,
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
                        Response.Status.INTERNAL_SERVER_ERROR, "Conversion was interrupted");
            } catch (IllegalArgumentException e) {
                String errorMessage = buildErrorMessage(e, originalFilename);
                log.error(
                        "Email to PDF conversion failed for {}: {}",
                        originalFilename,
                        errorMessage,
                        e);
                return errorResponse(Response.Status.INTERNAL_SERVER_ERROR, errorMessage);
            } catch (RuntimeException e) {
                String errorMessage = buildErrorMessage(e, originalFilename);
                log.error(
                        "Email to PDF conversion failed for {}: {}",
                        originalFilename,
                        errorMessage,
                        e);
                return errorResponse(Response.Status.INTERNAL_SERVER_ERROR, errorMessage);
            }

        } catch (IOException e) {
            log.error("File processing error for email to PDF: {}", originalFilename, e);
            return errorResponse(Response.Status.INTERNAL_SERVER_ERROR, "File processing error");
        }
    }

    private Response errorResponse(Response.Status status, String message) {
        byte[] body = message.getBytes(StandardCharsets.UTF_8);
        return Response.status(status)
                .header("Content-Length", body.length)
                .type(MediaType.TEXT_PLAIN)
                .entity(body)
                .build();
    }

    private static @NotNull String buildErrorMessage(Exception e, String originalFilename) {
        String safeFilename = htmlEscape(originalFilename);
        String exceptionMessage = e.getMessage();
        String safeExceptionMessage =
                exceptionMessage == null ? "Unknown error" : htmlEscape(exceptionMessage);
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

    // MIGRATION (Spring -> JAX-RS): replaces org.springframework.web.util.HtmlUtils#htmlEscape,
    // which has no Quarkus/JAX-RS equivalent. Escapes the five XML/HTML significant characters so
    // user-controlled filenames/exception messages cannot inject markup into error responses.
    private static String htmlEscape(String input) {
        if (input == null) {
            return null;
        }
        StringBuilder sb = new StringBuilder(input.length());
        for (int i = 0; i < input.length(); i++) {
            char c = input.charAt(i);
            switch (c) {
                case '&' -> sb.append("&amp;");
                case '<' -> sb.append("&lt;");
                case '>' -> sb.append("&gt;");
                case '"' -> sb.append("&quot;");
                case '\'' -> sb.append("&#39;");
                default -> sb.append(c);
            }
        }
        return sb.toString();
    }
}
