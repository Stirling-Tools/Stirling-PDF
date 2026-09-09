package stirling.software.SPDF.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.nio.file.Files;
import java.security.KeyStore;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.MockedStatic;
import org.springframework.core.io.ClassPathResource;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.controller.api.security.CertSignController;
import stirling.software.common.service.CustomPDFDocumentFactory;

class PdfSigningServiceImplTest {

    // Real PKCS12 fixture so CreateSignature can read aliases/key/chain; sign() itself is mocked.
    private static KeyStore realKeystore() throws Exception {
        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (InputStream is = new ClassPathResource("certs/test-cert.p12").getInputStream()) {
            ks.load(is, "password".toCharArray());
        }
        return ks;
    }

    @Nested
    @DisplayName("signWithKeystore")
    class SignWithKeystore {

        @Test
        @DisplayName("wires arguments through to CertSignController and returns the output bytes")
        void wiresArgsAndReturnsBytes() throws Exception {
            CustomPDFDocumentFactory factory = mock(CustomPDFDocumentFactory.class);
            PdfSigningServiceImpl service = new PdfSigningServiceImpl(factory);
            KeyStore keystore = realKeystore();
            byte[] pdf = "%PDF-1.4 fake".getBytes();

            ArgumentCaptor<MultipartFile> fileCaptor = ArgumentCaptor.forClass(MultipartFile.class);
            ArgumentCaptor<ByteArrayOutputStream> outCaptor =
                    ArgumentCaptor.forClass(ByteArrayOutputStream.class);

            try (MockedStatic<CertSignController> signer = mockStatic(CertSignController.class)) {
                signer.when(
                                () ->
                                        CertSignController.sign(
                                                any(),
                                                any(),
                                                any(),
                                                any(),
                                                eq(true),
                                                eq(2),
                                                eq("Alice"),
                                                eq("London"),
                                                eq("approval"),
                                                eq(false)))
                        .thenAnswer(
                                inv -> {
                                    ByteArrayOutputStream out = inv.getArgument(2);
                                    out.write("signed".getBytes());
                                    return null;
                                });

                byte[] result =
                        service.signWithKeystore(
                                pdf,
                                keystore,
                                "password".toCharArray(),
                                true,
                                2,
                                "Alice",
                                "London",
                                "approval",
                                false);

                assertThat(new String(result)).isEqualTo("signed");

                signer.verify(
                        () ->
                                CertSignController.sign(
                                        any(),
                                        fileCaptor.capture(),
                                        outCaptor.capture(),
                                        any(),
                                        eq(true),
                                        eq(2),
                                        eq("Alice"),
                                        eq("London"),
                                        eq("approval"),
                                        eq(false)));

                // Exercise the private ByteArrayMultipartFile wrapper passed to sign().
                MultipartFile wrapper = fileCaptor.getValue();
                assertThat(wrapper.getName()).isEqualTo("file");
                assertThat(wrapper.getOriginalFilename()).isEqualTo("document.pdf");
                assertThat(wrapper.getContentType()).isEqualTo("application/pdf");
                assertThat(wrapper.isEmpty()).isFalse();
                assertThat(wrapper.getSize()).isEqualTo(pdf.length);
                assertThat(wrapper.getBytes()).isEqualTo(pdf);
                try (InputStream in = wrapper.getInputStream()) {
                    assertThat(in.readAllBytes()).isEqualTo(pdf);
                }

                File dest = File.createTempFile("sign-wrapper", ".pdf");
                dest.deleteOnExit();
                wrapper.transferTo(dest);
                assertThat(Files.readAllBytes(dest.toPath())).isEqualTo(pdf);
            }
        }

        @Test
        @DisplayName("empty pdf bytes mark the wrapper as empty")
        void emptyWrapper() throws Exception {
            CustomPDFDocumentFactory factory = mock(CustomPDFDocumentFactory.class);
            PdfSigningServiceImpl service = new PdfSigningServiceImpl(factory);
            ArgumentCaptor<MultipartFile> fileCaptor = ArgumentCaptor.forClass(MultipartFile.class);

            try (MockedStatic<CertSignController> signer = mockStatic(CertSignController.class)) {
                signer.when(
                                () ->
                                        CertSignController.sign(
                                                any(),
                                                any(),
                                                any(),
                                                any(),
                                                org.mockito.ArgumentMatchers.anyBoolean(),
                                                any(),
                                                any(),
                                                any(),
                                                any(),
                                                org.mockito.ArgumentMatchers.anyBoolean()))
                        .thenAnswer(inv -> null);

                service.signWithKeystore(
                        new byte[0],
                        realKeystore(),
                        "password".toCharArray(),
                        false,
                        null,
                        null,
                        null,
                        null,
                        false);

                signer.verify(
                        () ->
                                CertSignController.sign(
                                        any(),
                                        fileCaptor.capture(),
                                        any(),
                                        any(),
                                        org.mockito.ArgumentMatchers.anyBoolean(),
                                        any(),
                                        any(),
                                        any(),
                                        any(),
                                        org.mockito.ArgumentMatchers.anyBoolean()));
                assertThat(fileCaptor.getValue().isEmpty()).isTrue();
                assertThat(fileCaptor.getValue().getSize()).isZero();
            }
        }
    }
}
