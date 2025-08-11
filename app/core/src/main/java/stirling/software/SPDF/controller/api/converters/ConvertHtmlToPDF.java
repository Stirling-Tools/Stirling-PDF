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

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.api.converters.HTMLToPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.CustomHtmlSanitizer;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.FileToPdf;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@RestController
@Tag(name = "Convert", description = "Convert APIs")
@RequestMapping("/api/v1/convert")
@RequiredArgsConstructor
public class ConvertHtmlToPDF {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    private final RuntimePathConfig runtimePathConfig;

    private final TempFileManager tempFileManager;

    private final CustomHtmlSanitizer customHtmlSanitizer;

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
            throw ExceptionUtils.createHtmlFileRequiredException();
        }

        String originalFilename = Filenames.toSimpleFileName(fileInput.getOriginalFilename());
        if (originalFilename == null
                || (!originalFilename.endsWith(".html") && !originalFilename.endsWith(".zip"))) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.fileFormatRequired", "File must be in {0} format", ".html or .zip");
        }

        byte[] pdfBytes =
                FileToPdf.convertHtmlToPdf(
                        runtimePathConfig.getWeasyPrintPath(),
                        request,
                        fileInput.getBytes(),
                        originalFilename,
                        tempFileManager,
                        customHtmlSanitizer);

        pdfBytes = pdfDocumentFactory.createNewBytesBasedOnOldDocument(pdfBytes);

        String outputFilename =
                originalFilename.replaceFirst("[.][^.]+$", "")
                        + ".pdf"; // Remove file extension and append .pdf

        return WebResponseUtils.bytesToWebResponse(pdfBytes, outputFilename);
    }
}
