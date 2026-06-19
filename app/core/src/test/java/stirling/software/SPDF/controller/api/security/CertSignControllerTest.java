package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.nio.file.Files;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.enterprise.inject.Instance;
import jakarta.ws.rs.core.Response;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.io.ClassPathResource;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.ServerCertificateServiceInterface;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class CertSignControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    @Mock private Instance<ServerCertificateServiceInterface> serverCertificateService;

    @InjectMocks private CertSignController certSignController;

    private byte[] pdfBytes;
    private byte[] pfxBytes;
    private byte[] p12Bytes;
    private byte[] jksBytes;
    private byte[] pemKeyBytes;
    private byte[] pemCertBytes;
    private byte[] keyBytes;
    private byte[] crtCertBytes;
    private byte[] cerCertBytes;
    private byte[] derCertBytes;

    private static byte[] readClasspath(String path) throws Exception {
        ClassPathResource resource = new ClassPathResource(path);
        try (InputStream is = resource.getInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            is.transferTo(baos);
            return baos.toByteArray();
        }
    }

    @BeforeEach
    void setUp() throws Exception {
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("test", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            pdfBytes = baos.toByteArray();
        }
        pfxBytes = readClasspath("certs/test-cert.pfx");
        p12Bytes = readClasspath("certs/test-cert.p12");
        jksBytes = readClasspath("certs/test-cert.jks");
        pemKeyBytes = readClasspath("certs/test-key.pem");
        pemCertBytes = readClasspath("certs/test-cert.pem");
        keyBytes = readClasspath("certs/test-key.key");
        crtCertBytes = readClasspath("certs/test-cert.crt");
        cerCertBytes = readClasspath("certs/test-cert.cer");
        derCertBytes = readClasspath("certs/test-cert.der");

        lenient()
                .when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(
                        invocation -> {
                            MultipartFile file = invocation.getArgument(0);
                            return Loader.loadPDF(file.getBytes());
                        });
    }

    @Test
    void testSignPdfWithPfx() throws Exception {
        FileUpload pdfFile = TestFileUploads.pdf(pdfBytes);
        FileUpload pfxFile = TestFileUploads.of(pfxBytes, "test-cert.pfx", "application/x-pkcs12");

        Response response =
                certSignController.signPDFWithCert(
                        pdfFile,
                        null,
                        "PFX",
                        null,
                        null,
                        pfxFile,
                        null,
                        "password",
                        false,
                        "test",
                        "test",
                        "tester",
                        1,
                        false);

        assertNotNull(response.getEntity());
        assertEquals(200, response.getStatus());
    }

    @Test
    void testSignPdfWithPkcs12() throws Exception {
        FileUpload pdfFile = TestFileUploads.pdf(pdfBytes);
        FileUpload p12File = TestFileUploads.of(p12Bytes, "test-cert.p12", "application/x-pkcs12");

        Response response =
                certSignController.signPDFWithCert(
                        pdfFile,
                        null,
                        "PKCS12",
                        null,
                        null,
                        p12File,
                        null,
                        "password",
                        false,
                        "test",
                        "test",
                        "tester",
                        1,
                        false);

        assertNotNull(response.getEntity());
        assertEquals(200, response.getStatus());
    }

    @Test
    void testSignPdfWithMissingPkcs12FileThrowsError() {
        FileUpload pdfFile = TestFileUploads.pdf(pdfBytes);

        IllegalArgumentException exception =
                assertThrows(
                        IllegalArgumentException.class,
                        () ->
                                certSignController.signPDFWithCert(
                                        pdfFile,
                                        null,
                                        "PFX",
                                        null,
                                        null,
                                        null,
                                        null,
                                        "password",
                                        false,
                                        "test",
                                        "test",
                                        "tester",
                                        1,
                                        false));

        assertTrue(exception.getMessage().contains("PKCS12 keystore"));
    }

    @Test
    void testSignPdfWithJks() throws Exception {
        FileUpload pdfFile = TestFileUploads.pdf(pdfBytes);
        FileUpload jksFile =
                TestFileUploads.of(jksBytes, "test-cert.jks", "application/octet-stream");

        Response response =
                certSignController.signPDFWithCert(
                        pdfFile,
                        null,
                        "JKS",
                        null,
                        null,
                        null,
                        jksFile,
                        "password",
                        false,
                        "test",
                        "test",
                        "tester",
                        1,
                        false);

        assertNotNull(response.getEntity());
        assertEquals(200, response.getStatus());
    }

    @Test
    void testSignPdfWithPem() throws Exception {
        FileUpload pdfFile = TestFileUploads.pdf(pdfBytes);
        FileUpload keyFile =
                TestFileUploads.of(pemKeyBytes, "test-key.pem", "application/x-pem-file");
        FileUpload certFile =
                TestFileUploads.of(pemCertBytes, "test-cert.pem", "application/x-pem-file");

        Response response =
                certSignController.signPDFWithCert(
                        pdfFile,
                        null,
                        "PEM",
                        keyFile,
                        certFile,
                        null,
                        null,
                        "password",
                        false,
                        "test",
                        "test",
                        "tester",
                        1,
                        false);

        assertNotNull(response.getEntity());
        assertEquals(200, response.getStatus());
    }

    @Test
    void testSignPdfWithCrt() throws Exception {
        FileUpload pdfFile = TestFileUploads.pdf(pdfBytes);
        FileUpload keyFile = TestFileUploads.of(keyBytes, "test-key.key", "application/x-pem-file");
        FileUpload certFile =
                TestFileUploads.of(crtCertBytes, "test-cert.crt", "application/x-x509-ca-cert");

        Response response =
                certSignController.signPDFWithCert(
                        pdfFile,
                        null,
                        "PEM",
                        keyFile,
                        certFile,
                        null,
                        null,
                        "password",
                        false,
                        "test",
                        "test",
                        "tester",
                        1,
                        false);

        assertNotNull(response.getEntity());
        assertEquals(200, response.getStatus());
    }

    @Test
    void testSignPdfWithCer() throws Exception {
        FileUpload pdfFile = TestFileUploads.pdf(pdfBytes);
        FileUpload keyFile = TestFileUploads.of(keyBytes, "test-key.key", "application/x-pem-file");
        FileUpload certFile =
                TestFileUploads.of(cerCertBytes, "test-cert.cer", "application/x-x509-ca-cert");

        Response response =
                certSignController.signPDFWithCert(
                        pdfFile,
                        null,
                        "PEM",
                        keyFile,
                        certFile,
                        null,
                        null,
                        "password",
                        false,
                        "test",
                        "test",
                        "tester",
                        1,
                        false);

        assertNotNull(response.getEntity());
        assertEquals(200, response.getStatus());
    }

    @Test
    void testSignPdfWithDer() throws Exception {
        FileUpload pdfFile = TestFileUploads.pdf(pdfBytes);
        FileUpload keyFile = TestFileUploads.of(keyBytes, "test-key.key", "application/x-pem-file");
        FileUpload certFile =
                TestFileUploads.of(derCertBytes, "test-cert.der", "application/x-x509-ca-cert");

        Response response =
                certSignController.signPDFWithCert(
                        pdfFile,
                        null,
                        "PEM",
                        keyFile,
                        certFile,
                        null,
                        null,
                        "password",
                        false,
                        "test",
                        "test",
                        "tester",
                        1,
                        false);

        assertNotNull(response.getEntity());
        assertEquals(200, response.getStatus());
    }
}
