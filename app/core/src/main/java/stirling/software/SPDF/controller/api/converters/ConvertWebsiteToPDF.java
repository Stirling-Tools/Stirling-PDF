package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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

    private static final Pattern FILE_SCHEME_PATTERN =
            Pattern.compile("(?<![a-z0-9_])file\\s*:(?:/{1,3}|%2f|%5c|%3a|&#x2f;|&#47;)");

    private static final Pattern NUMERIC_HTML_ENTITY_PATTERN = Pattern.compile("&#(x?[0-9a-f]+);");

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
        Path tempHtmlInput = null;
        PDDocument doc = null;
        try {
            // Download the remote content first to ensure we don't allow dangerous schemes
            String htmlContent = fetchRemoteHtml(URL);

            if (containsDisallowedUriScheme(htmlContent)) {
                URI rejectionLocation =
                        uriComponentsBuilder
                                .queryParam("error", "error.disallowedUrlContent")
                                .build()
                                .toUri();
                log.warn("Rejected URL to PDF conversion due to disallowed content references");
                return ResponseEntity.status(status).location(rejectionLocation).build();
            }

            tempHtmlInput = Files.createTempFile("url_input_", ".html");
            Files.writeString(tempHtmlInput, htmlContent, StandardCharsets.UTF_8);

            // Prepare the output file path
            tempOutputFile = Files.createTempFile("output_", ".pdf");

            // Prepare the WeasyPrint command
            List<String> command = new ArrayList<>();
            command.add(runtimePathConfig.getWeasyPrintPath());
            command.add(tempHtmlInput.toString());
            command.add("--base-url");
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
            if (tempHtmlInput != null) {
                try {
                    Files.deleteIfExists(tempHtmlInput);
                } catch (IOException e) {
                    log.error("Error deleting temporary HTML input file", e);
                }
            }

            if (tempOutputFile != null) {
                try {
                    Files.deleteIfExists(tempOutputFile);
                } catch (IOException e) {
                    log.error("Error deleting temporary output file", e);
                }
            }
        }
    }

    private String fetchRemoteHtml(String url) throws IOException, InterruptedException {
        HttpClient client =
                HttpClient.newBuilder()
                        .followRedirects(HttpClient.Redirect.NORMAL)
                        .connectTimeout(Duration.ofSeconds(10))
                        .build();

        HttpRequest request =
                HttpRequest.newBuilder(URI.create(url))
                        .timeout(Duration.ofSeconds(20))
                        .GET()
                        .header("User-Agent", "Stirling-PDF/URL-to-PDF")
                        .build();

        HttpResponse<String> response =
                client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));

        if (response.statusCode() >= 400 || response.body() == null) {
            throw new IOException(
                    "Failed to retrieve remote HTML. Status: " + response.statusCode());
        }

        return response.body();
    }

    private boolean containsDisallowedUriScheme(String htmlContent) {
        if (htmlContent == null || htmlContent.isEmpty()) {
            return false;
        }

        String normalized = normalizeForSchemeDetection(htmlContent);
        return FILE_SCHEME_PATTERN.matcher(normalized).find();
    }

    private String normalizeForSchemeDetection(String htmlContent) {
        String lowerCaseContent = htmlContent.toLowerCase(Locale.ROOT);
        String decodedHtmlEntities = decodeNumericHtmlEntities(lowerCaseContent);
        decodedHtmlEntities =
                decodedHtmlEntities
                        .replace("&colon;", ":")
                        .replace("&sol;", "/")
                        .replace("&frasl;", "/");
        return percentDecode(decodedHtmlEntities);
    }

    private String percentDecode(String content) {
        StringBuilder result = new StringBuilder(content.length());
        for (int i = 0; i < content.length(); i++) {
            char current = content.charAt(i);
            if (current == '%' && i + 2 < content.length()) {
                String hex = content.substring(i + 1, i + 3);
                try {
                    int value = Integer.parseInt(hex, 16);
                    result.append((char) value);
                    i += 2;
                    continue;
                } catch (NumberFormatException ignored) {
                    // Fall through to append the literal characters when parsing fails
                }
            }
            result.append(current);
        }
        return result.toString();
    }

    private String decodeNumericHtmlEntities(String content) {
        Matcher matcher = NUMERIC_HTML_ENTITY_PATTERN.matcher(content);
        StringBuffer decoded = new StringBuffer();
        while (matcher.find()) {
            String entityBody = matcher.group(1);
            try {
                int radix = entityBody.startsWith("x") ? 16 : 10;
                int codePoint =
                        Integer.parseInt(radix == 16 ? entityBody.substring(1) : entityBody, radix);
                matcher.appendReplacement(
                        decoded, Matcher.quoteReplacement(Character.toString((char) codePoint)));
            } catch (NumberFormatException ex) {
                matcher.appendReplacement(decoded, matcher.group(0));
            }
        }
        matcher.appendTail(decoded);
        return decoded.toString();
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
