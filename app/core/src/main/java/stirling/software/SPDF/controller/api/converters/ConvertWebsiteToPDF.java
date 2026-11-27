package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.converters.UrlToPdfRequest;
import stirling.software.SPDF.service.OfficeToPdfService;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.RegexPatternUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.officeconvert.topdf.WebAssets;

@ConvertApi
@Slf4j
@RequiredArgsConstructor
public class ConvertWebsiteToPDF {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final OfficeToPdfService officeToPdfService;
    private final ApplicationProperties applicationProperties;
    private final TempFileManager tempFileManager;

    private static final Pattern FILE_SCHEME_PATTERN =
            Pattern.compile("(?<![a-z0-9_])file\\s*:(?:/{1,3}|%2f|%5c|%3a|&#x2f;|&#47;)");

    private static final Pattern NUMERIC_HTML_ENTITY_PATTERN = Pattern.compile("&#(x?[0-9a-f]+);");

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/url/pdf",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @ToolIO(accepts = ToolFormat.NONE, produces = ToolFormat.PDF)
    @Operation(
            summary = "Convert a URL to a PDF",
            description =
                    "This endpoint fetches content from a URL and converts it to a PDF format.")
    public ResponseEntity<?> urlToPdf(@ModelAttribute UrlToPdfRequest request)
            throws IOException, InterruptedException {
        String URL = request.getUrlInput();
        if (!applicationProperties.getSystem().isEnableUrlToPDF()) {
            return errorResponse(HttpStatus.FORBIDDEN, "URL to PDF is disabled on this server.");
        }
        if (URL == null || URL.isBlank()) {
            return errorResponse(HttpStatus.BAD_REQUEST, "Enter a valid HTTP or HTTPS URL.");
        }
        URL = URL.trim();
        boolean patternValid =
                RegexPatternUtils.getInstance().getHttpUrlPattern().matcher(URL).matches();
        boolean generalValid = GeneralUtils.isValidURL(URL);
        if (!patternValid && !generalValid) {
            return errorResponse(HttpStatus.BAD_REQUEST, "Enter a valid HTTP or HTTPS URL.");
        }

        WebAssets assets;
        try {
            // Public addresses only, for the page, every asset it links and every redirect hop.
            assets =
                    WebAssets.fetch(
                            URL,
                            WebAssets.Access.none()
                                    .network(true)
                                    .redirects(true)
                                    .privateAddresses(false));
        } catch (IOException e) {
            log.info("URL to PDF fetch refused or failed for {}: {}", URL, e.getMessage());
            return errorResponse(
                    HttpStatus.BAD_REQUEST, "The URL is not allowed or could not be reached.");
        }

        Path tempOutputFile = null;
        Path tempHtmlInput = null;
        try {
            String htmlContent = new String(assets.page(), StandardCharsets.UTF_8);

            if (containsDisallowedUriScheme(htmlContent)) {
                log.warn("Rejected URL to PDF conversion due to disallowed content references");
                return errorResponse(
                        HttpStatus.BAD_REQUEST,
                        "The web page contains disallowed local file references.");
            }

            tempHtmlInput = Files.createTempFile("url_input_", ".html");
            Files.write(tempHtmlInput, assets.page());
            tempOutputFile = Files.createTempFile("output_", ".pdf");
            officeToPdfService.convert(
                    tempHtmlInput, tempOutputFile, officeToPdfService.options().htmlAssets(assets));

            // Load the PDF using pdfDocumentFactory
            String outputFilename = convertURLToFileName(URL);
            TempFile tempOut = tempFileManager.createManagedTempFile(".pdf");
            try (PDDocument doc = pdfDocumentFactory.load(tempOutputFile.toFile())) {
                doc.save(tempOut.getFile());
            } catch (Exception e) {
                tempOut.close();
                throw e;
            }
            return WebResponseUtils.pdfFileToWebResponse(tempOut, outputFilename);
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

    private static ResponseEntity<ProblemDetail> errorResponse(HttpStatus status, String message) {
        return ResponseEntity.status(status)
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(ProblemDetail.forStatusAndDetail(status, message));
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
