package stirling.software.SPDF.controller.api.security;

import java.beans.PropertyEditorSupport;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.PKIXCertPathBuilderResult;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPublicKey;
import java.util.ArrayList;
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
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;

@Slf4j
@SecurityApi
@RequiredArgsConstructor
public class ValidateSignatureController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final CertificateValidationService certValidationService;

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
    @Operation(
            summary = "Validate PDF Digital Signature",
            description =
                    "Validates the digital signatures in a PDF file using PKIX path building"
                            + " and time-of-signing semantics. Supports custom trust anchors."
                            + " Input:PDF Output:JSON Type:SISO")
    @AutoJobPostMapping(
            value = "/validate-signature",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
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

        try (PDDocument document = pdfDocumentFactory.load(file.getInputStream())) {
            List<PDSignature> signatures = document.getSignatureDictionaries();

            for (PDSignature sig : signatures) {
                SignatureValidationResult result = new SignatureValidationResult();

                try {
                    byte[] signedContent = sig.getSignedContent(file.getInputStream());
                    byte[] signatureBytes = sig.getContents(file.getInputStream());

                    CMSProcessable content = new CMSProcessableByteArray(signedContent);
                    CMSSignedData signedData = new CMSSignedData(content, signatureBytes);

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
                        if (validationTimeResult == null) {
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
                        result.setSignatureDate(
                                sig.getSignDate() != null
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
}
