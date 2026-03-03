package stirling.software.SPDF.controller.api.security;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigInteger;
import java.net.HttpURLConnection;
import java.net.URI;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.Security;
import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

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

    private static final Set<String> ALLOWED_TSA_PRESETS =
            Set.of(
                    "http://timestamp.digicert.com",
                    "http://timestamp.sectigo.com",
                    "http://ts.ssl.com",
                    "http://timestamp.entrust.net/TSS/RFC3161sha2TS",
                    "http://freetsa.org/tsr");

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
        Set<String> allowedUrls = new HashSet<>(ALLOWED_TSA_PRESETS);
        allowedUrls.add(tsConfig.getDefaultTsaUrl());
        List<String> customUrls = tsConfig.getCustomTsaUrls();
        if (customUrls != null) {
            allowedUrls.addAll(customUrls);
        }

        // Validate TSA URL against allowed set to prevent SSRF
        if (!allowedUrls.contains(tsaUrl)) {
            throw new IllegalArgumentException(
                    "TSA URL is not in the allowed list. Contact your administrator to add it"
                            + " via settings.yml (security.timestamp.customTsaUrls).");
        }

        final String effectiveTsaUrl = tsaUrl;
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();

        try (PDDocument document = pdfDocumentFactory.load(inputFile)) {
            PDSignature signature = new PDSignature();
            signature.setType(COSName.DOC_TIME_STAMP);
            signature.setFilter(PDSignature.FILTER_ADOBE_PPKLITE);
            signature.setSubFilter(COSName.getPDFName("ETSI.RFC3161"));
            signature.setSignDate(Calendar.getInstance());

            document.addSignature(
                    signature, content -> requestTimestampToken(content, effectiveTsaUrl));

            document.saveIncremental(outputStream);
        }

        return WebResponseUtils.bytesToWebResponse(
                outputStream.toByteArray(),
                GeneralUtils.generateFilename(inputFile.getOriginalFilename(), "_timestamped.pdf"));
    }

    private byte[] requestTimestampToken(InputStream content, String tsaUrl) throws IOException {
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
            BigInteger nonce = BigInteger.valueOf(new SecureRandom().nextLong() & Long.MAX_VALUE);
            ASN1ObjectIdentifier digestAlgorithm = NISTObjectIdentifiers.id_sha256;
            TimeStampRequest tsaRequest = generator.generate(digestAlgorithm, hash, nonce);
            byte[] requestBytes = tsaRequest.getEncoded();

            // Contact the TSA server (redirects disabled to prevent SSRF via redirect)
            HttpURLConnection connection =
                    (HttpURLConnection) URI.create(tsaUrl).toURL().openConnection();
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
                throw new IOException(
                        "TSA server returned HTTP " + responseCode + " for URL: " + tsaUrl);
            }

            byte[] responseBytes;
            try (InputStream in = connection.getInputStream()) {
                responseBytes = in.readAllBytes();
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
        }
    }
}
