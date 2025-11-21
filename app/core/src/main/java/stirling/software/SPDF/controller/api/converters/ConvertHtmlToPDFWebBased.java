package stirling.software.SPDF.controller.api.converters;

import java.nio.charset.StandardCharsets;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.microsoft.playwright.*;
import com.microsoft.playwright.options.Media;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.api.converters.HTMLToPdfWebBasedRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.*;

@RestController
@Tag(name = "Convert", description = "Convert APIs")
@RequestMapping("/api/v1/convert")
@RequiredArgsConstructor
public class ConvertHtmlToPDFWebBased {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    private final CustomHtmlSanitizer customHtmlSanitizer;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/html/pdf/chromium")
    @Operation(
            summary = "Convert an HTML to PDF using Chrome-headless-shell",
            description =
                    "This endpoint takes an HTML input and converts it to a PDF format using Chrome-headless-shell."
                            + " Input:HTML Output:PDF Type:SISO")
    public ResponseEntity<byte[]> HtmlToPdf(@ModelAttribute HTMLToPdfWebBasedRequest request)
            throws Exception {
        MultipartFile fileInput = request.getFileInput();

        if (fileInput == null) {
            throw ExceptionUtils.createHtmlFileRequiredException();
        }

        String originalFilename = Filenames.toSimpleFileName(fileInput.getOriginalFilename());
        if (originalFilename == null || (!originalFilename.endsWith(".html"))) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.fileFormatRequired", "File must be in {0} format", ".html");
        }
        byte[] fileBytes = fileInput.getBytes();
        String htmlContent = new String(fileBytes, StandardCharsets.UTF_8);
        String sanitizedHtml = customHtmlSanitizer.sanitize(htmlContent);
        byte[] pdfBytes;
        try (Playwright playwright = Playwright.create()) {
            BrowserType chromium = playwright.chromium();
            Browser browser = chromium.launch();
            BrowserContext context = browser.newContext();
            Page page = context.newPage();
            page.setContent(sanitizedHtml);
            // Generates a PDF with "screen" media type.
            page.emulateMedia(new Page.EmulateMediaOptions().setMedia(Media.SCREEN));
            pdfBytes = page.pdf(new Page.PdfOptions().setPrintBackground(true));
            browser.close();
        }

        pdfBytes = pdfDocumentFactory.createNewBytesBasedOnOldDocument(pdfBytes);

        String outputFilename = GeneralUtils.generateFilename(originalFilename, ".pdf");

        return WebResponseUtils.bytesToWebResponse(pdfBytes, outputFilename);
    }
}
