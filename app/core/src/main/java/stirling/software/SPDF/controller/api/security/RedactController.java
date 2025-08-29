package stirling.software.SPDF.controller.api.security;

import java.awt.*;
import java.io.IOException;
import java.util.List;
import java.util.Objects;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.api.security.ManualRedactPdfRequest;
import stirling.software.SPDF.model.api.security.RedactPdfRequest;
import stirling.software.SPDF.service.RedactionService;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.common.util.propertyeditor.StringToArrayListPropertyEditor;

@RestController
@RequestMapping("/api/v1/security")
@Tag(name = "Security", description = "Security APIs")
public class RedactController {
    private RedactionService redactionService;
    private CustomPDFDocumentFactory pdfDocumentFactory;

    public RedactController(
            RedactionService redactionService, CustomPDFDocumentFactory pdfDocumentFactory) {
        this.redactionService = redactionService;
        this.pdfDocumentFactory = pdfDocumentFactory;
    }

    public static Color decodeOrDefault(String hex) {
        return RedactionService.decodeOrDefault(hex);
    }

    private String removeFileExtension(String filename) {
        return filename.replaceFirst("[.][^.]+$", "");
    }

    @InitBinder
    public void initBinder(WebDataBinder binder) {
        binder.registerCustomEditor(
                List.class, "redactions", new StringToArrayListPropertyEditor());
    }

    public static String createPlaceholderWithFont(
            String originalWord, org.apache.pdfbox.pdmodel.font.PDFont font) {
        return RedactionService.createPlaceholderWithFont(originalWord, font);
    }

    public static void writeFilteredContentStream(
            PDDocument document, PDPage page, java.util.List<Object> tokens) throws IOException {
        RedactionService.writeFilteredContentStream(document, page, tokens);
    }

    private RedactionService ensureService() {
        if (redactionService == null) {
            if (pdfDocumentFactory == null) {
                throw new IllegalStateException(
                        "RedactionService not available and pdfDocumentFactory is null");
            }
            redactionService = new RedactionService(pdfDocumentFactory, null);
        }
        return redactionService;
    }

    @PostMapping(value = "/redact", consumes = "multipart/form-data")
    @Operation(
            summary = "Redact PDF manually",
            description =
                    "This endpoint redacts content from a PDF file based on manually specified areas. "
                            + "Users can specify areas to redact and optionally convert the PDF to an image. "
                            + "Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> redactPDF(@ModelAttribute ManualRedactPdfRequest request)
            throws IOException {
        byte[] pdfContent = ensureService().redactPDF(request);
        return WebResponseUtils.bytesToWebResponse(
                pdfContent,
                removeFileExtension(
                                Objects.requireNonNull(
                                        Filenames.toSimpleFileName(
                                                request.getFileInput().getOriginalFilename())))
                        + "_redacted.pdf");
    }

    @PostMapping(value = "/auto-redact", consumes = "multipart/form-data")
    @Operation(
            summary = "Redact PDF automatically",
            description =
                    "This endpoint automatically redacts text from a PDF file based on specified patterns. "
                            + "Users can provide text patterns to redact, with options for regex and whole word matching. "
                            + "Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> redactPdf(@ModelAttribute RedactPdfRequest request)
            throws IOException {
        byte[] pdfContent = ensureService().redactPdf(request);
        return WebResponseUtils.bytesToWebResponse(
                pdfContent,
                removeFileExtension(
                                Objects.requireNonNull(
                                        Filenames.toSimpleFileName(
                                                request.getFileInput().getOriginalFilename())))
                        + "_redacted.pdf");
    }

    public boolean isTextShowingOperator(String opName) {
        return RedactionService.isTextShowingOperator(opName);
    }

    public java.util.List<Object> createTokensWithoutTargetText(
            PDDocument document,
            PDPage page,
            java.util.Set<String> targetWords,
            boolean useRegex,
            boolean wholeWordSearch)
            throws IOException {
        return ensureService()
                .createTokensWithoutTargetText(
                        document, page, targetWords, useRegex, wholeWordSearch);
    }
}
