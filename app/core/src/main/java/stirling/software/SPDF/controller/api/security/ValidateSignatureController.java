package stirling.software.SPDF.controller.api.security;

import java.beans.PropertyEditorSupport;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.PKIXCertPathBuilderResult;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPublicKey;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Date;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cms.CMSProcessable;
import org.bouncycastle.cms.CMSProcessableByteArray;
import org.bouncycastle.cms.CMSSignedData;
import org.bouncycastle.cms.SignerInformation;
import org.bouncycastle.cms.SignerInformationStore;
import org.bouncycastle.cms.jcajce.JcaSimpleSignerInfoVerifierBuilder;
import org.bouncycastle.operator.jcajce.JcaDigestCalculatorProviderBuilder;
import org.bouncycastle.tsp.TimeStampToken;
import org.bouncycastle.tsp.TimeStampTokenInfo;
import org.bouncycastle.util.Store;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.JsonDataResponse;
import stirling.software.SPDF.model.api.security.SignatureValidationRequest;
import stirling.software.SPDF.model.api.security.SignatureValidationResult;
import stirling.software.SPDF.service.CertificateValidationService;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.SecurityApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;

@Slf4j
@SecurityApi
@RequiredArgsConstructor
public class ValidateSignatureController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final CertificateValidationService certValidationService;

    /** PDF sub-filter identifying an RFC 3161 document timestamp (PAdES-LTV). */
    private static final String SUBFILTER_RFC3161 = "ETSI.RFC3161";

    @InitBinder
    public void initBinder(WebDataBinder binder) {
        binder.registerCustomEditor(
                MultipartFile.class,
                new PropertyEditorSupport() {
                    @Override
                    public void setAsText(String text) throws IllegalArgumentException {
                        setValue(null);
                    }
                });
    }

    @JsonDataResponse
    @ToolIO(produces = ToolFormat.JSON)
    @Operation(
            summary = "Validate PDF Digital Signature",
            description =
                    "Validates the digital signatures in a PDF file using PKIX path building and"
                            + " time-of-signing semantics. Supports custom trust anchors.")
    @AutoJobPostMapping(
            value = "/validate-signature",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    public ResponseEntity<List<SignatureValidationResult>> validateSignature(
            @ModelAttribute SignatureValidationRequest request) throws IOException {
        List<SignatureValidationResult> results = new ArrayList<>();
        MultipartFile file = request.getFileInput();

        // Load custom certificate if provided
        X509Certificate customCert = null;
        if (request.getCertFile() != null && !request.getCertFile().isEmpty()) {
            try (ByteArrayInputStream certStream =
                    new ByteArrayInputStream(request.getCertFile().getBytes())) {
                CertificateFactory cf = CertificateFactory.getInstance("X.509");
                customCert = (X509Certificate) cf.generateCertificate(certStream);
            } catch (CertificateException e) {
                throw ExceptionUtils.createRuntimeException(
                        "error.invalidFormat",
                        "Invalid {0} format: {1}",
                        e,
                        "certificate file",
                        e.getMessage());
            }
        }

        // Parsed only for signature dictionaries; digests use the raw upload bytes, read by
        // offset (a stream skip() may legally return 0), so encrypted PDFs check as signed.
        byte[] pdfBytes = file.getBytes();
        String password = request.getDocumentPassword();
        try (PDDocument document =
                password == null || password.isEmpty()
                        ? pdfDocumentFactory.load(new ByteArrayInputStream(pdfBytes))
                        : pdfDocumentFactory.load(new ByteArrayInputStream(pdfBytes), password)) {
            List<PDSignature> signatures = document.getSignatureDictionaries();

            // Detect content appended outside every signature's ByteRange (added after signing). A
            // properly signed document has its last signature cover all the way to EOF; if the
            // furthest any signature reaches stops short of the file length, the tail is unsigned.
            // Taking the max across all signatures avoids false positives on legitimately
            // multi-signed PDFs, where an earlier signature intentionally omits later revisions.
            long fileLength = pdfBytes.length;
            long maxCovered = 0;
            for (PDSignature sig : signatures) {
                maxCovered = Math.max(maxCovered, byteRangeEnd(sig.getByteRange()));
            }
            boolean documentCovered = maxCovered <= 0 || maxCovered >= fileLength;

            for (PDSignature sig : signatures) {
                SignatureValidationResult result = new SignatureValidationResult();
                result.setCoversEntireDocument(documentCovered);

                // A ByteRange that no longer lines up with the file means a re-save (typically a
                // removed password); PDFBox would report only skip() or hex-parsing failures.
                if (!byteRangeFitsFile(sig.getByteRange(), pdfBytes)) {
                    result.setValid(false);
                    result.setErrorMessage(
                            "This file was modified after it was signed (for example its password"
                                    + " was removed), so the signed byte range no longer matches."
                                    + " Validate the original signed file.");
                    results.add(result);
                    continue;
                }

                try {
                    byte[] signedContent = extractSignedContent(sig.getByteRange(), pdfBytes);
                    byte[] signatureBytes = sig.getContents(pdfBytes);

                    // An RFC 3161 document timestamp (PAdES-LTV) carries its signed content
                    // *inside* the CMS - a TSTInfo - rather than being detached over the document.
                    // Building it as detached digests the ByteRange against an attribute that
                    // covers the TSTInfo, which can never match.
                    boolean isDocTimeStamp = SUBFILTER_RFC3161.equals(sig.getSubFilter());
                    CMSSignedData signedData;
                    // Parse from a stream: /Contents is zero-padded to its reserved length and the
                    // byte[] constructors reject those trailing bytes since BC 1.85.
                    if (isDocTimeStamp) {
                        signedData = new CMSSignedData(new ByteArrayInputStream(signatureBytes));
                    } else {
                        // adbe.pkcs7.sha1 signs the SHA-1 digest of the byte range, not the range.
                        byte[] cmsContent =
                                PDSignature.SUBFILTER_ADBE_PKCS7_SHA1
                                                .getName()
                                                .equals(sig.getSubFilter())
                                        ? MessageDigest.getInstance("SHA-1").digest(signedContent)
                                        : signedContent;
                        CMSProcessable content = new CMSProcessableByteArray(cmsContent);
                        signedData =
                                new CMSSignedData(
                                        content, new ByteArrayInputStream(signatureBytes));
                    }

                    // What actually binds a timestamp to this document: the TSTInfo's message
                    // imprint must equal the digest of the signed byte range. Without this check a
                    // valid timestamp token for some *other* document would verify happily here.
                    Date timeStampGenTime = null;
                    if (isDocTimeStamp) {
                        TimeStampToken token = new TimeStampToken(signedData);
                        TimeStampTokenInfo info = token.getTimeStampInfo();
                        timeStampGenTime = info.getGenTime();
                        if (!timestampCoversContent(info, signedContent)) {
                            result.setValid(false);
                            result.setErrorMessage(
                                    "Timestamp message imprint does not match the document");
                            results.add(result);
                            continue;
                        }
                    }

                    Store<X509CertificateHolder> certStore = signedData.getCertificates();
                    SignerInformationStore signerStore = signedData.getSignerInfos();

                    for (SignerInformation signerInfo : signerStore.getSigners()) {
                        X509CertificateHolder certHolder =
                                (X509CertificateHolder)
                                        certStore.getMatches(signerInfo.getSID()).iterator().next();
                        X509Certificate signerCert =
                                new JcaX509CertificateConverter().getCertificate(certHolder);

                        // Extract intermediate certificates from CMS
                        Collection<X509Certificate> intermediates =
                                certValidationService.extractIntermediateCertificates(
                                        certStore, signerCert);

                        // Log what we found
                        log.debug(
                                "Found {} intermediate certificates in CMS signature",
                                intermediates.size());
                        for (X509Certificate inter : intermediates) {
                            log.debug(
                                    "  → Intermediate: {}",
                                    inter.getSubjectX500Principal().getName());
                            log.debug(
                                    "    Issuer DN: {}", inter.getIssuerX500Principal().getName());
                        }

                        // Determine validation time (TSA timestamp or signingTime, or current)
                        CertificateValidationService.ValidationTime validationTimeResult =
                                certValidationService.extractValidationTime(signerInfo);
                        Date validationTime;
                        if (timeStampGenTime != null) {
                            // The TSA's own asserted time is the authoritative one here, and is
                            // exactly what makes the signature verifiable after the cert expires.
                            validationTime = timeStampGenTime;
                            // Distinct from "timestamp", which CertificateValidationService already
                            // uses for a signature countersigned by a TSA. Both are RFC 3161, but
                            // one attests a signature and the other attests the whole document.
                            result.setValidationTimeSource("document-timestamp");
                        } else if (validationTimeResult == null) {
                            validationTime = new Date();
                            result.setValidationTimeSource("current");
                        } else {
                            validationTime = validationTimeResult.date;
                            result.setValidationTimeSource(validationTimeResult.source);
                        }

                        // Verify cryptographic signature
                        boolean cmsValid =
                                signerInfo.verify(
                                        new JcaSimpleSignerInfoVerifierBuilder().build(signerCert));
                        result.setValid(cmsValid);

                        // Build and validate certificate path
                        boolean chainValid = false;
                        boolean trustValid = false;
                        try {
                            PKIXCertPathBuilderResult pathResult =
                                    certValidationService.buildAndValidatePath(
                                            signerCert, intermediates, customCert, validationTime);
                            chainValid = true;
                            trustValid = true; // Path ends at trust anchor
                            result.setCertPathLength(
                                    pathResult.getCertPath().getCertificates().size());
                        } catch (Exception e) {
                            String errorMsg = e.getMessage();
                            result.setChainValidationError(errorMsg);
                            chainValid = false;
                            trustValid = false;
                            // Log the full error for debugging
                            log.warn(
                                    "Certificate path validation failed for {}: {}",
                                    signerCert.getSubjectX500Principal().getName(),
                                    errorMsg);
                            log.debug("Full stack trace:", e);
                        }
                        result.setChainValid(chainValid);
                        result.setTrustValid(trustValid);

                        // Check validity at validation time
                        boolean outside =
                                certValidationService.isOutsideValidityPeriod(
                                        signerCert, validationTime);
                        result.setNotExpired(!outside);

                        // Revocation status determination
                        boolean revocationEnabled = certValidationService.isRevocationEnabled();
                        result.setRevocationChecked(revocationEnabled);

                        if (!revocationEnabled) {
                            result.setRevocationStatus("not-checked");
                        } else if (chainValid && trustValid) {
                            // Path building succeeded with revocation enabled = no revocation found
                            result.setRevocationStatus("good");
                        } else if (result.getChainValidationError() != null
                                && result.getChainValidationError()
                                        .toLowerCase()
                                        .contains("revocation")) {
                            // Check if failure was revocation-related
                            if (result.getChainValidationError()
                                    .toLowerCase()
                                    .contains("unable to check")) {
                                result.setRevocationStatus("soft-fail");
                            } else {
                                result.setRevocationStatus("revoked");
                            }
                        } else {
                            result.setRevocationStatus("unknown");
                        }

                        // Set basic signature info
                        result.setSignerName(sig.getName());
                        // A DocTimeStamp has no /M entry; its date is the TSA's genTime.
                        result.setSignatureDate(
                                timeStampGenTime != null
                                        ? timeStampGenTime.toString()
                                        : sig.getSignDate() != null
                                                ? sig.getSignDate().getTime().toString()
                                                : null);
                        result.setReason(sig.getReason());
                        result.setLocation(sig.getLocation());

                        // Set certificate details (from signer cert)
                        result.setIssuerDN(signerCert.getIssuerX500Principal().getName());
                        result.setSubjectDN(signerCert.getSubjectX500Principal().getName());
                        result.setSerialNumber(
                                signerCert.getSerialNumber().toString(16)); // Hex format
                        result.setValidFrom(signerCert.getNotBefore().toString());
                        result.setValidUntil(signerCert.getNotAfter().toString());
                        result.setSignatureAlgorithm(signerCert.getSigAlgName());

                        // Get key size (if possible)
                        try {
                            result.setKeySize(
                                    ((RSAPublicKey) signerCert.getPublicKey())
                                            .getModulus()
                                            .bitLength());
                        } catch (Exception e) {
                            // If not RSA or error, set to 0
                            result.setKeySize(0);
                        }

                        result.setVersion(String.valueOf(signerCert.getVersion()));

                        // Set key usage
                        List<String> keyUsages = new ArrayList<>();
                        boolean[] keyUsageFlags = signerCert.getKeyUsage();
                        if (keyUsageFlags != null) {
                            String[] keyUsageLabels = {
                                "Digital Signature",
                                "Non-Repudiation",
                                "Key Encipherment",
                                "Data Encipherment",
                                "Key Agreement",
                                "Certificate Signing",
                                "CRL Signing",
                                "Encipher Only",
                                "Decipher Only"
                            };
                            for (int i = 0; i < keyUsageFlags.length; i++) {
                                if (keyUsageFlags[i]) {
                                    keyUsages.add(keyUsageLabels[i]);
                                }
                            }
                        }
                        result.setKeyUsages(keyUsages);

                        // Check if self-signed (properly)
                        result.setSelfSigned(certValidationService.isSelfSigned(signerCert));
                    }
                } catch (Exception e) {
                    result.setValid(false);
                    result.setErrorMessage("Signature validation failed: " + e.getMessage());
                }

                results.add(result);
            }
        }

        return ResponseEntity.ok(results);
    }

    /** Per ISO 32000 the ByteRange gap holds exactly the {@code <hex>} Contents string. */
    private static boolean byteRangeFitsFile(int[] byteRange, byte[] pdfBytes) {
        if (byteRange == null || byteRange.length != 4) {
            return true;
        }
        long gapStart = (long) byteRange[0] + byteRange[1];
        long gapEnd = byteRange[2];
        if (byteRange[0] < 0
                || byteRange[1] < 0
                || byteRange[3] < 0
                || gapEnd - gapStart < 2
                || byteRangeEnd(byteRange) > pdfBytes.length) {
            return false;
        }
        return pdfBytes[(int) gapStart] == '<' && pdfBytes[(int) gapEnd - 1] == '>';
    }

    /** Concatenates the (offset, length) pairs of a ByteRange, bounds-checked against the file. */
    static byte[] extractSignedContent(int[] byteRange, byte[] pdfBytes) throws IOException {
        if (byteRange == null || byteRange.length == 0 || byteRange.length % 2 != 0) {
            throw new IOException("signature has a missing or malformed /ByteRange");
        }
        long total = 0;
        for (int i = 0; i < byteRange.length; i += 2) {
            long start = byteRange[i];
            long end = start + byteRange[i + 1];
            if (start < 0 || end < start || end > pdfBytes.length) {
                throw new IOException(
                        "signature /ByteRange "
                                + Arrays.toString(byteRange)
                                + " does not fit the "
                                + pdfBytes.length
                                + "-byte file");
            }
            total += end - start;
        }
        byte[] content = new byte[Math.toIntExact(total)];
        int pos = 0;
        for (int i = 0; i < byteRange.length; i += 2) {
            System.arraycopy(pdfBytes, byteRange[i], content, pos, byteRange[i + 1]);
            pos += byteRange[i + 1];
        }
        return content;
    }

    /** Offset just past the last byte a signature covers, or 0 for a malformed ByteRange. */
    private static long byteRangeEnd(int[] byteRange) {
        return byteRange != null && byteRange.length == 4 ? (long) byteRange[2] + byteRange[3] : 0;
    }

    /**
     * True when the timestamp token was issued over exactly these bytes.
     *
     * <p>The digest algorithm is taken from the token rather than assumed, because a TSA chooses it
     * - assuming SHA-256 would silently fail against any TSA that uses something else.
     */
    private static boolean timestampCoversContent(TimeStampTokenInfo info, byte[] signedContent)
            throws Exception {
        org.bouncycastle.operator.DigestCalculator digest =
                new JcaDigestCalculatorProviderBuilder().build().get(info.getHashAlgorithm());
        try (java.io.OutputStream out = digest.getOutputStream()) {
            out.write(signedContent);
        }
        return Arrays.equals(digest.getDigest(), info.getMessageImprintDigest());
    }
}
