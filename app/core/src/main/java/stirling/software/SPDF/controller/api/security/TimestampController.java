package stirling.software.SPDF.controller.api.security;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigInteger;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.Security;
import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.bouncycastle.asn1.ASN1ObjectIdentifier;
import org.bouncycastle.asn1.nist.NISTObjectIdentifiers;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.tsp.TimeStampRequest;
import org.bouncycastle.tsp.TimeStampRequestGenerator;
import org.bouncycastle.tsp.TimeStampResponse;
import org.bouncycastle.tsp.TimeStampToken;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.security.TimestampPdfRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.SecurityApi;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.WebResponseUtils;

@Slf4j
@SecurityApi
@RequiredArgsConstructor
public class TimestampController {

    static {
        Security.addProvider(new BouncyCastleProvider());
    }

    /** Built-in TSA presets with labels — single source of truth for backend + frontend. */
    public static final List<Map<String, String>> TSA_PRESETS =
            List.of(
                    Map.of("label", "DigiCert", "url", "http://timestamp.digicert.com"),
                    Map.of("label", "Sectigo", "url", "http://timestamp.sectigo.com"),
                    Map.of("label", "SSL.com", "url", "http://ts.ssl.com"),
                    Map.of(
                            "label",
                            "Entrust",
                            "url",
                            "http://timestamp.entrust.net/TSS/RFC3161sha2TS"),
                    Map.of("label", "FreeTSA", "url", "http://freetsa.org/tsr"));

    private static final Set<String> ALLOWED_TSA_PRESET_URLS =
            TSA_PRESETS.stream().map(p -> p.get("url")).collect(Collectors.toUnmodifiableSet());

    private static final int MAX_TSA_RESPONSE_SIZE = 1024 * 1024; // 1 MB
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final ApplicationProperties applicationProperties;

    @AutoJobPostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/timestamp-pdf")
    @StandardPdfResponse
    @Operation(
            summary = "Add RFC 3161 document timestamp to a PDF",
            description =
                    "Contacts a trusted Time Stamp Authority (TSA) server and embeds an RFC 3161"
                            + " document timestamp into the PDF. Only a SHA-256 hash of the"
                            + " document is sent to the TSA — the PDF itself never leaves the"
                            + " server. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> timestampPdf(@ModelAttribute TimestampPdfRequest request)
            throws Exception {
        MultipartFile inputFile = request.getFileInput();
        ApplicationProperties.Security.Timestamp tsConfig =
                applicationProperties.getSecurity().getTimestamp();

        // Determine effective TSA URL: use request value if provided, otherwise config default
        String tsaUrl =
                (request.getTsaUrl() != null && !request.getTsaUrl().isBlank())
                        ? request.getTsaUrl()
                        : tsConfig.getDefaultTsaUrl();

        // Build allowed set: built-in presets + admin-configured custom URLs
        // Filter null/blank entries and validate protocol (TASK-6)
        Set<String> allowedUrls = new HashSet<>(ALLOWED_TSA_PRESET_URLS);
        if (tsConfig.getDefaultTsaUrl() != null
                && !tsConfig.getDefaultTsaUrl().isBlank()
                && isValidTsaUrlProtocol(tsConfig.getDefaultTsaUrl())) {
            allowedUrls.add(tsConfig.getDefaultTsaUrl());
        }
        List<String> customUrls = tsConfig.getCustomTsaUrls();
        if (customUrls != null) {
            customUrls.stream()
                    .filter(u -> u != null && !u.isBlank() && isValidTsaUrlProtocol(u))
                    .forEach(allowedUrls::add);
        }

        // Normalize for case-insensitive comparison (TASK-12)
        Set<String> normalizedAllowed =
                allowedUrls.stream()
                        .map(TimestampController::normalizeTsaUrl)
                        .collect(Collectors.toSet());

        // Validate TSA URL against allowed set to prevent SSRF
        if (!normalizedAllowed.contains(normalizeTsaUrl(tsaUrl))) {
            throw new IllegalArgumentException(
                    "TSA URL is not in the allowed list. Contact your administrator to add it"
                            + " via settings.yml (security.timestamp.customTsaUrls).");
        }

        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();

        try (PDDocument document = pdfDocumentFactory.load(inputFile)) {
            PDSignature signature = new PDSignature();
            signature.setType(COSName.DOC_TIME_STAMP);
            signature.setFilter(PDSignature.FILTER_ADOBE_PPKLITE);
            signature.setSubFilter(COSName.getPDFName("ETSI.RFC3161"));
            signature.setSignDate(Calendar.getInstance());

            document.addSignature(signature, content -> requestTimestampToken(content, tsaUrl));

            document.saveIncremental(outputStream);
        }

        return WebResponseUtils.bytesToWebResponse(
                outputStream.toByteArray(),
                GeneralUtils.generateFilename(inputFile.getOriginalFilename(), "_timestamped.pdf"));
    }

    private byte[] requestTimestampToken(InputStream content, String tsaUrl) throws IOException {
        HttpURLConnection connection = null;
        try {
            // Hash the PDF content byte range with SHA-256
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[8192];
            int read;
            while ((read = content.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
            byte[] hash = digest.digest();

            // Build the RFC 3161 timestamp request
            TimeStampRequestGenerator generator = new TimeStampRequestGenerator();
            generator.setCertReq(true);
            BigInteger nonce = BigInteger.valueOf(SECURE_RANDOM.nextLong() & Long.MAX_VALUE);
            ASN1ObjectIdentifier digestAlgorithm = NISTObjectIdentifiers.id_sha256;
            TimeStampRequest tsaRequest = generator.generate(digestAlgorithm, hash, nonce);
            byte[] requestBytes = tsaRequest.getEncoded();

            // Contact the TSA server (redirects disabled to prevent SSRF via redirect)
            connection = (HttpURLConnection) URI.create(tsaUrl).toURL().openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setDoOutput(true);
            connection.setDoInput(true);
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Content-Type", "application/timestamp-query");
            connection.setRequestProperty("Content-Length", String.valueOf(requestBytes.length));
            connection.setConnectTimeout(30_000);
            connection.setReadTimeout(30_000);

            try (OutputStream out = connection.getOutputStream()) {
                out.write(requestBytes);
            }

            int responseCode = connection.getResponseCode();
            if (responseCode != HttpURLConnection.HTTP_OK) {
                // Read error stream for debugging (TASK-5)
                String errorBody = readErrorStream(connection);
                throw new IOException(
                        "TSA server returned HTTP "
                                + responseCode
                                + " for URL: "
                                + tsaUrl
                                + (errorBody.isEmpty() ? "" : " — " + errorBody));
            }

            // Read response with size limit to prevent OOM (TASK-4)
            byte[] responseBytes;
            try (InputStream in = connection.getInputStream()) {
                responseBytes = in.readNBytes(MAX_TSA_RESPONSE_SIZE);
                if (in.read() != -1) {
                    throw new IOException(
                            "TSA response exceeds maximum allowed size of "
                                    + MAX_TSA_RESPONSE_SIZE
                                    + " bytes");
                }
            }

            // Parse and validate the TSA response
            TimeStampResponse tsaResponse = new TimeStampResponse(responseBytes);
            tsaResponse.validate(tsaRequest);

            TimeStampToken token = tsaResponse.getTimeStampToken();
            if (token == null) {
                throw new IOException(
                        "TSA server did not return a timestamp token. Status: "
                                + tsaResponse.getStatus());
            }

            log.info(
                    "RFC 3161 timestamp obtained from {} at {}",
                    tsaUrl,
                    token.getTimeStampInfo().getGenTime());

            return token.getEncoded();

        } catch (IOException e) {
            throw e;
        } catch (Exception e) {
            throw new IOException(
                    "Failed to obtain RFC 3161 timestamp from " + tsaUrl + ": " + e.getMessage(),
                    e);
        } finally {
            // Always disconnect to release the underlying socket (TASK-1)
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private static boolean isValidTsaUrlProtocol(String url) {
        String lower = url.toLowerCase(Locale.ROOT);
        return lower.startsWith("http://") || lower.startsWith("https://");
    }

    private static String normalizeTsaUrl(String url) {
        try {
            URI uri = URI.create(url.trim());
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            int port = uri.getPort();
            String path = uri.getPath() == null ? "" : uri.getPath();
            return scheme + "://" + host + (port == -1 ? "" : ":" + port) + path;
        } catch (Exception e) {
            return url.toLowerCase(Locale.ROOT);
        }
    }

    private static String readErrorStream(HttpURLConnection connection) {
        try (InputStream err = connection.getErrorStream()) {
            if (err == null) return "";
            byte[] body = err.readNBytes(2048);
            return new String(body, StandardCharsets.UTF_8).trim();
        } catch (IOException e) {
            return "";
        }
    }
}
