package stirling.software.SPDF.controller.api.security;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPublicKey;
import java.util.ArrayList;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.api.security.SignatureValidationRequest;
import stirling.software.SPDF.model.api.security.SignatureValidationResult;
import stirling.software.SPDF.service.CertificateValidationService;
import stirling.software.SPDF.service.CustomPDDocumentFactory;

@RestController
@RequestMapping("/api/v1/security")
@Tag(name = "Security", description = "Security APIs")
public class ValidateSignatureController {

    private final CustomPDDocumentFactory pdfDocumentFactory;
    private final CertificateValidationService certValidationService;

    @Autowired
    public ValidateSignatureController(
            CustomPDDocumentFactory pdfDocumentFactory,
            CertificateValidationService certValidationService) {
        this.pdfDocumentFactory = pdfDocumentFactory;
        this.certValidationService = certValidationService;
    }

    @Operation(
            summary = "Validate PDF Digital Signature",
            description =
                    "Validates the digital signatures in a PDF file against default or custom certificates. Input:PDF Output:JSON Type:SISO")
    @PostMapping(value = "/validate-signature")
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
                throw new RuntimeException("Invalid certificate file: " + e.getMessage());
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

                    for (SignerInformation signer : signerStore.getSigners()) {
                        X509CertificateHolder certHolder =
                                (X509CertificateHolder)
                                        certStore.getMatches(signer.getSID()).iterator().next();
                        X509Certificate cert =
                                new JcaX509CertificateConverter().getCertificate(certHolder);

                        boolean isValid =
                                signer.verify(new JcaSimpleSignerInfoVerifierBuilder().build(cert));
                        result.setValid(isValid);

                        // Additional validations
                        result.setChainValid(
                                customCert != null
                                        ? certValidationService
                                                .validateCertificateChainWithCustomCert(
                                                        cert, customCert)
                                        : certValidationService.validateCertificateChain(cert));

                        result.setTrustValid(
                                customCert != null
                                        ? certValidationService.validateTrustWithCustomCert(
                                                cert, customCert)
                                        : certValidationService.validateTrustStore(cert));

                        result.setNotRevoked(!certValidationService.isRevoked(cert));
                        result.setNotExpired(!cert.getNotAfter().before(new Date()));

                        // Set basic signature info
                        result.setSignerName(sig.getName());
                        result.setSignatureDate(sig.getSignDate().getTime().toString());
                        result.setReason(sig.getReason());
                        result.setLocation(sig.getLocation());

                        // Set new certificate details
                        result.setIssuerDN(cert.getIssuerX500Principal().getName());
                        result.setSubjectDN(cert.getSubjectX500Principal().getName());
                        result.setSerialNumber(cert.getSerialNumber().toString(16)); // Hex format
                        result.setValidFrom(cert.getNotBefore().toString());
                        result.setValidUntil(cert.getNotAfter().toString());
                        result.setSignatureAlgorithm(cert.getSigAlgName());

                        // Get key size (if possible)
                        try {
                            result.setKeySize(
                                    ((RSAPublicKey) cert.getPublicKey()).getModulus().bitLength());
                        } catch (Exception e) {
                            // If not RSA or error, set to 0
                            result.setKeySize(0);
                        }

                        result.setVersion(String.valueOf(cert.getVersion()));

                        // Set key usage
                        List<String> keyUsages = new ArrayList<>();
                        boolean[] keyUsageFlags = cert.getKeyUsage();
                        if (keyUsageFlags != null) {
                            String[] keyUsageLabels = {
                                "Digital Signature", "Non-Repudiation", "Key Encipherment",
                                "Data Encipherment", "Key Agreement", "Certificate Signing",
                                "CRL Signing", "Encipher Only", "Decipher Only"
                            };
                            for (int i = 0; i < keyUsageFlags.length; i++) {
                                if (keyUsageFlags[i]) {
                                    keyUsages.add(keyUsageLabels[i]);
                                }
                            }
                        }
                        result.setKeyUsages(keyUsages);

                        // Check if self-signed
                        result.setSelfSigned(
                                cert.getSubjectX500Principal()
                                        .equals(cert.getIssuerX500Principal()));
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
