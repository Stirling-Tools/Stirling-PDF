package stirling.software.SPDF.controller.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.security.SignatureValidationRequest;
import stirling.software.SPDF.model.api.security.SignatureValidationResult;
import stirling.software.SPDF.service.CertificateValidationService;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;

/**
 * Signature validation must not depend on the upload's stream supporting skip().
 *
 * <p>InputStream.skip() is allowed to return 0, and servlet container part streams do. PDFBox walks
 * the /ByteRange by skipping the signature hole, so reading the signed content straight off the
 * upload stream failed with "FilterInputStream.skip() returns 0" on files that other validators
 * (pdfsig) accept.
 */
class ValidateSignatureStreamHandlingTest {

    private ValidateSignatureController controller;
    private byte[] signedPdf;

    @BeforeEach
    void setUp() throws Exception {
        CertificateValidationService certValidationService =
                new CertificateValidationService(null, new ApplicationProperties());
        CustomPDFDocumentFactory factory = org.mockito.Mockito.mock(CustomPDFDocumentFactory.class);
        when(factory.load(any(InputStream.class)))
                .thenAnswer(
                        invocation ->
                                Loader.loadPDF(
                                        ((InputStream) invocation.getArgument(0)).readAllBytes()));
        controller = new ValidateSignatureController(factory, certValidationService);

        try (InputStream in =
                new ClassPathResource("timestamp/doc-timestamped.pdf").getInputStream()) {
            signedPdf = in.readAllBytes();
        }
    }

    @Test
    @DisplayName("Validates a signature when the upload stream cannot skip")
    void validatesWhenUploadStreamCannotSkip() throws Exception {
        SignatureValidationRequest request = new SignatureValidationRequest();
        request.setFileInput(new NonSkippingMultipartFile(signedPdf));

        List<SignatureValidationResult> results = controller.validateSignature(request).getBody();

        assertThat(results).hasSize(1);
        assertThat(results.get(0).getErrorMessage()).isNull();
        assertThat(results.get(0).isValid()).isTrue();
    }

    @Test
    @DisplayName("Produces the same verdict whether or not the stream can skip")
    void matchesTheSkippableStreamVerdict() throws Exception {
        SignatureValidationRequest skippable = new SignatureValidationRequest();
        skippable.setFileInput(
                new MockMultipartFile("fileInput", "doc.pdf", "application/pdf", signedPdf));

        SignatureValidationRequest unskippable = new SignatureValidationRequest();
        unskippable.setFileInput(new NonSkippingMultipartFile(signedPdf));

        SignatureValidationResult expected =
                controller.validateSignature(skippable).getBody().get(0);
        SignatureValidationResult actual =
                controller.validateSignature(unskippable).getBody().get(0);

        assertThat(actual.isValid()).isEqualTo(expected.isValid());
        assertThat(actual.getErrorMessage()).isEqualTo(expected.getErrorMessage());
        assertThat(actual.getSubjectDN()).isEqualTo(expected.getSubjectDN());
    }

    /** Upload whose stream honours the InputStream contract that skip() may return 0. */
    private static final class NonSkippingMultipartFile extends MockMultipartFile {

        private final byte[] content;

        NonSkippingMultipartFile(byte[] content) {
            super("fileInput", "doc.pdf", "application/pdf", content);
            this.content = content;
        }

        @Override
        public InputStream getInputStream() throws IOException {
            return new FilterInputStream(new ByteArrayInputStream(content)) {
                @Override
                public long skip(long n) {
                    return 0;
                }
            };
        }
    }
}
