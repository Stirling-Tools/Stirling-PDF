package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.converters.UrlToPdfRequest;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.WebResponseUtils;

@RestController
@Tag(name = "Convert", description = "Convert APIs")
@Slf4j
@RequestMapping("/api/v1/convert")
@RequiredArgsConstructor
public class ConvertWebsiteToPDF {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final RuntimePathConfig runtimePathConfig;
    private final ApplicationProperties applicationProperties;

    @PostMapping(consumes = "multipart/form-data", value = "/url/pdf")
    @Operation(
            summary = "Convert a URL to a PDF",
            description =
                    "This endpoint fetches content from a URL and converts it to a PDF format."
                            + " Input:N/A Output:PDF Type:SISO")
    public ResponseEntity<byte[]> urlToPdf(@ModelAttribute UrlToPdfRequest request)
            throws IOException, InterruptedException {
        String URL = request.getUrlInput();

        if (!applicationProperties.getSystem().getEnableUrlToPDF()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.endpointDisabled", "This endpoint has been disabled by the admin");
        }
        // Validate the URL format
        if (!URL.matches("^https?://.*") || !GeneralUtils.isValidURL(URL)) {
            throw ExceptionUtils.createInvalidArgumentException(
                    "URL", "provided format is invalid");
        }

        // validate the URL is reachable
        if (!GeneralUtils.isURLReachable(URL)) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.urlNotReachable", "URL is not reachable, please provide a valid URL");
        }

        Path tempOutputFile = null;
        PDDocument doc = null;
        try {
            // Prepare the output file path
            tempOutputFile = Files.createTempFile("output_", ".pdf");

            // Prepare the WeasyPrint command
            List<String> command = new ArrayList<>();
            command.add(runtimePathConfig.getWeasyPrintPath());
            command.add(URL);
            command.add("--pdf-forms");
            command.add(tempOutputFile.toString());

            ProcessExecutorResult returnCode =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.WEASYPRINT)
                            .runCommandWithOutputHandling(command);

            // Load the PDF using pdfDocumentFactory
            doc = pdfDocumentFactory.load(tempOutputFile.toFile());

            // Convert URL to a safe filename
            String outputFilename = convertURLToFileName(URL);

            return WebResponseUtils.pdfDocToWebResponse(doc, outputFilename);
        } finally {

            if (tempOutputFile != null) {
                try {
                    Files.deleteIfExists(tempOutputFile);
                } catch (IOException e) {
                    log.error("Error deleting temporary output file", e);
                }
            }
        }
    }

    private String convertURLToFileName(String url) {
        String safeName = url.replaceAll("[^a-zA-Z0-9]", "_");
        if (safeName.length() > 50) {
            safeName = safeName.substring(0, 50); // restrict to 50 characters
        }
        return safeName + ".pdf";
    }
}
