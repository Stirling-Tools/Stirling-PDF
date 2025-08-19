package stirling.software.SPDF.controller.api.security;

import java.io.IOException;
import java.util.List;
import java.util.Objects;

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

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.api.security.ManualRedactPdfRequest;
import stirling.software.SPDF.model.api.security.RedactPdfRequest;
import stirling.software.SPDF.service.RedactionService;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.common.util.propertyeditor.StringToArrayListPropertyEditor;

@RestController
@RequestMapping("/api/v1/security")
@Tag(name = "Security", description = "Security APIs")
@RequiredArgsConstructor
public class RedactController {

    private final RedactionService redactionService;

    private String removeFileExtension(String filename) {
        return filename.replaceFirst("[.][^.]+$", "");
    }

    @InitBinder
    public void initBinder(WebDataBinder binder) {
        binder.registerCustomEditor(
                List.class, "redactions", new StringToArrayListPropertyEditor());
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
        byte[] pdfContent = redactionService.redactPDF(request);
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
        byte[] pdfContent = redactionService.redactPdf(request);
        return WebResponseUtils.bytesToWebResponse(
            pdfContent,
            removeFileExtension(
                Objects.requireNonNull(
                    Filenames.toSimpleFileName(
                        request.getFileInput().getOriginalFilename())))
                + "_redacted.pdf");
    }
}
