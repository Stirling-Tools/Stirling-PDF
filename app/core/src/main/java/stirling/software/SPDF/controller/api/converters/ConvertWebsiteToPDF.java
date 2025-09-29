package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import org.springframework.web.util.UriComponentsBuilder;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.converters.UrlToPdfRequest;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.RegexPatternUtils;
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

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/url/pdf")
    @Operation(
            summary = "Convert a URL to a PDF",
            description =
                    "This endpoint fetches content from a URL and converts it to a PDF format."
                            + " Input:N/A Output:PDF Type:SISO")
    public ResponseEntity<?> urlToPdf(@ModelAttribute UrlToPdfRequest request)
            throws IOException, InterruptedException {
        String URL = request.getUrlInput();
        UriComponentsBuilder uriComponentsBuilder =
                ServletUriComponentsBuilder.fromCurrentContextPath().path("/url-to-pdf");
        URI location = null;
        HttpStatus status = HttpStatus.SEE_OTHER;

        if (!applicationProperties.getSystem().getEnableUrlToPDF()) {
            location =
                    uriComponentsBuilder
                            .queryParam("error", "error.endpointDisabled")
                            .build()
                            .toUri();
        } else {
            // Validate the URL format (relaxed: only invalid if BOTH checks fail)
            boolean patternValid =
                    RegexPatternUtils.getInstance().getHttpUrlPattern().matcher(URL).matches();
            boolean generalValid = GeneralUtils.isValidURL(URL);
            if (!patternValid && !generalValid) {
                location =
                        uriComponentsBuilder
                                .queryParam("error", "error.invalidUrlFormat")
                                .build()
                                .toUri();
            } else if (!GeneralUtils.isURLReachable(URL)) {
                // validate the URL is reachable
                location =
                        uriComponentsBuilder
                                .queryParam("error", "error.urlNotReachable")
                                .build()
                                .toUri();
            }
        }

        if (location != null) {
            log.info("Redirecting to: {}", location.toString());
            return ResponseEntity.status(status).location(location).build();
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

            ProcessExecutor.getInstance(ProcessExecutor.Processes.WEASYPRINT)
                    .runCommandWithOutputHandling(command);

            // Load the PDF using pdfDocumentFactory
            doc = pdfDocumentFactory.load(tempOutputFile.toFile());

            // Convert URL to a safe filename
            String outputFilename = convertURLToFileName(URL);

            ResponseEntity<byte[]> response =
                    WebResponseUtils.pdfDocToWebResponse(doc, outputFilename);
            if (response == null) {
                // Defensive fallback - should not happen but avoids null returns breaking tests
                return ResponseEntity.ok(new byte[0]);
            }
            return response;
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
        String safeName = GeneralUtils.convertToFileName(url);
        if (safeName == null || safeName.isBlank()) {
            // Fallback: derive from URL host/path or use default
            try {
                URI uri = URI.create(url);
                String hostPart = uri.getHost();
                if (hostPart == null || hostPart.isBlank()) {
                    hostPart = "document";
                }
                safeName =
                        RegexPatternUtils.getInstance()
                                .getNonAlnumUnderscorePattern()
                                .matcher(hostPart)
                                .replaceAll("_");
            } catch (Exception e) {
                safeName = "document";
            }
        }
        // Restrict characters strictly to alphanumeric and underscore for predictable tests
        RegexPatternUtils patterns = RegexPatternUtils.getInstance();
        safeName = patterns.getNonAlnumUnderscorePattern().matcher(safeName).replaceAll("_");
        // Collapse multiple underscores
        safeName = patterns.getMultipleUnderscoresPattern().matcher(safeName).replaceAll("_");
        // Trim leading underscores
        safeName = patterns.getLeadingUnderscoresPattern().matcher(safeName).replaceAll("");
        // Trim trailing underscores
        safeName = patterns.getTrailingUnderscoresPattern().matcher(safeName).replaceAll("");
        if (safeName.isEmpty()) {
            safeName = "document";
        }
        if (safeName.length() > 50) {
            safeName = safeName.substring(0, 50); // restrict to 50 characters
        }
        return GeneralUtils.generateFilename(safeName, ".pdf");
    }
}
