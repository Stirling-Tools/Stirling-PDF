package stirling.software.SPDF.controller.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.security.SignatureValidationRequest;
import stirling.software.SPDF.model.api.security.SignatureValidationResult;
import stirling.software.SPDF.service.CertificateValidationService;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;

/**
 * Validation of RFC 3161 document timestamps (PAdES-LTV).
 *
 * <p>These fixtures are a real PDF stamped by a real public TSA (freetsa.org). Before this was
 * handled explicitly, every such timestamp was reported invalid: a DocTimeStamp's CMS encapsulates
 * a TSTInfo rather than being detached over the document, so digesting the byte range compared
 * against the wrong thing and always mismatched. That made the timestamp feature look broken to
 * anyone who checked their own output with our validator.
 */
class DocumentTimestampValidationTest {

    private ValidateSignatureController controller;

    @BeforeEach
    void setUp() throws Exception {
        CertificateValidationService certValidationService =
                new CertificateValidationService(null, new ApplicationProperties());
        CustomPDFDocumentFactory factory = org.mockito.Mockito.mock(CustomPDFDocumentFactory.class);
        // Delegate to the real loader so the signature dictionary is parsed as in production.
        when(factory.load(any(InputStream.class)))
                .thenAnswer(
                        invocation ->
                                Loader.loadPDF(
                                        ((InputStream) invocation.getArgument(0)).readAllBytes()));
        controller = new ValidateSignatureController(factory, certValidationService);
    }

    @Test
    void aGenuineDocumentTimestampValidates() throws Exception {
        SignatureValidationResult result = validate("timestamp/doc-timestamped.pdf");

        assertThat(result.isValid()).isTrue();
        assertThat(result.getErrorMessage()).isNull();
        // The TSA's asserted time is what keeps the signature verifiable once the signing
        // certificate expires, so it must be the time we validate against.
        // Deliberately not "timestamp" - that value already means "signature countersigned by a
        // TSA", which is a different assertion about a different thing.
        assertThat(result.getValidationTimeSource()).isEqualTo("document-timestamp");
        assertThat(result.getSignatureDate()).isNotNull();
        assertThat(result.getSubjectDN()).contains("freetsa.org");
        assertThat(result.isCoversEntireDocument()).isTrue();
    }

    @Test
    void aTamperedDocumentFailsTheMessageImprintCheck() throws Exception {
        // Same file with a single byte flipped inside the signed range. Without the imprint check
        // the CMS signature over the TSTInfo would still verify happily - the token is untouched -
        // and a modified document would be reported as validly timestamped.
        SignatureValidationResult result = validate("timestamp/doc-timestamped-tampered.pdf");

        assertThat(result.isValid()).isFalse();
        assertThat(result.getErrorMessage())
                .isEqualTo("Timestamp message imprint does not match the document");
    }

    private SignatureValidationResult validate(String resource) throws IOException {
        byte[] bytes;
        try (InputStream in = new ClassPathResource(resource).getInputStream()) {
            bytes = in.readAllBytes();
        }
        SignatureValidationRequest request = new SignatureValidationRequest();
        request.setFileInput(
                new MockMultipartFile("fileInput", "doc.pdf", "application/pdf", bytes));

        List<SignatureValidationResult> results = controller.validateSignature(request).getBody();
        assertThat(results).hasSize(1);
        return results.get(0);
    }
}
