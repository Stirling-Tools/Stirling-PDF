package stirling.software.SPDF.controller.api.converters;

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

import stirling.software.SPDF.config.RuntimePathConfig;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.api.converters.HTMLToPdfRequest;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;
import stirling.software.SPDF.utils.FileToPdf;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@Tag(name = "Convert", description = "Convert APIs")
@RequestMapping("/api/v1/convert")
@RequiredArgsConstructor
public class ConvertHtmlToPDF {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    private final ApplicationProperties applicationProperties;

    private final RuntimePathConfig runtimePathConfig;

    @PostMapping(consumes = "multipart/form-data", value = "/html/pdf")
    @Operation(
            summary = "Convert an HTML or ZIP (containing HTML and CSS) to PDF",
            description =
                    "This endpoint takes an HTML or ZIP file input and converts it to a PDF format."
                            + " Input:HTML Output:PDF Type:SISO")
    public ResponseEntity<byte[]> HtmlToPdf(@ModelAttribute HTMLToPdfRequest request)
            throws Exception {
        MultipartFile fileInput = request.getFileInput();

        if (fileInput == null) {
            throw new IllegalArgumentException(
                    "Please provide an HTML or ZIP file for conversion.");
        }

        String originalFilename = Filenames.toSimpleFileName(fileInput.getOriginalFilename());
        if (originalFilename == null
                || (!originalFilename.endsWith(".html") && !originalFilename.endsWith(".zip"))) {
            throw new IllegalArgumentException("File must be either .html or .zip format.");
        }

        boolean disableSanitize =
                Boolean.TRUE.equals(applicationProperties.getSystem().getDisableSanitize());

        byte[] pdfBytes =
                FileToPdf.convertHtmlToPdf(
                        runtimePathConfig.getWeasyPrintPath(),
                        request,
                        fileInput.getBytes(),
                        originalFilename,
                        disableSanitize);

        pdfBytes = pdfDocumentFactory.createNewBytesBasedOnOldDocument(pdfBytes);

        String outputFilename =
                originalFilename.replaceFirst("[.][^.]+$", "")
                        + ".pdf"; // Remove file extension and append .pdf

        return WebResponseUtils.bytesToWebResponse(pdfBytes, outputFilename);
    }
}
