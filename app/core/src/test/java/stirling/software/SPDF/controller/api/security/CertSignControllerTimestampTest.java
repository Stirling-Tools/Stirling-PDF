package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.concurrent.TimeUnit;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.SPDF.model.api.security.SignPDFWithCertRequest;
import stirling.software.SPDF.pdf.signature.TsaUrlResolver;
import stirling.software.SPDF.service.HardwareKeyStoreService;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;

/**
 * Verifies that {@code addTimestamp} on {@link SignPDFWithCertRequest} is actually wired end to
 * end: resolved through {@link TsaUrlResolver}, set on the {@code CreateSignature} instance, and
 * used by {@link stirling.software.SPDF.pdf.signature.CreateSignatureBase#sign} to contact a real
 * TSA server while the PDF is being signed.
 *
 * <p>A loopback {@link MockWebServer} stands in for the TSA. {@link CertSignController}'s own
 * {@code sign} helper swallows exceptions from the underlying signing call (it only logs them), so
 * a garbage TSA response never surfaces as a thrown exception here - the only reliable signal that
 * the timestamp path actually ran is whether the mock server received the HTTP request at all.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CertSignControllerTimestampTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @Mock private HardwareKeyStoreService hardwareKeyStoreService;
    @Mock private HttpServletRequest httpRequest;
    @Mock private TsaUrlResolver tsaUrlResolver;

    private CertSignController certSignController;
    private MockWebServer server;
    private byte[] pdfBytes;
    private byte[] pfxBytes;

    @BeforeEach
    void setUp() throws Exception {
        certSignController =
                new CertSignController(
                        pdfDocumentFactory,
                        null,
                        tempFileManager,
                        hardwareKeyStoreService,
                        tsaUrlResolver);

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

        lenient()
                .when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(invocation -> Loader.loadPDF(pdfBytes));

        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            pdfBytes = baos.toByteArray();
        }

        ClassPathResource pfxResource = new ClassPathResource("certs/test-cert.pfx");
        try (InputStream is = pfxResource.getInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            is.transferTo(baos);
            pfxBytes = baos.toByteArray();
        }

        server = new MockWebServer();
        server.start();
    }

    @AfterEach
    void tearDown() throws Exception {
        if (server != null) {
            server.shutdown();
        }
    }

    private SignPDFWithCertRequest baseRequest(boolean addTimestamp) {
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);
        MockMultipartFile pfxFile =
                new MockMultipartFile("p12File", "test-cert.pfx", "application/x-pkcs12", pfxBytes);

        SignPDFWithCertRequest request = new SignPDFWithCertRequest();
        request.setFileInput(pdfFile);
        request.setCertType("PFX");
        request.setP12File(pfxFile);
        request.setPassword("password");
        request.setShowSignature(false);
        request.setReason("test");
        request.setLocation("test");
        request.setName("tester");
        request.setPageNumber(1);
        request.setShowLogo(false);
        request.setAddTimestamp(addTimestamp);
        return request;
    }

    @Test
    @DisplayName(
            "addTimestamp=true resolves the default TSA URL and POSTs a timestamp query while signing")
    void addTimestampTrueContactsTsaServer() throws Exception {
        server.enqueue(
                new MockResponse()
                        .setResponseCode(200)
                        .addHeader("Content-Type", "application/timestamp-reply")
                        .setBody("not-a-real-token"));

        String tsaUrl = server.url("/tsr").toString();
        when(tsaUrlResolver.resolveDefault()).thenReturn(tsaUrl);

        SignPDFWithCertRequest request = baseRequest(true);

        certSignController.signPDFWithCert(request, httpRequest);

        verify(tsaUrlResolver).resolveDefault();

        RecordedRequest recorded = server.takeRequest(5, TimeUnit.SECONDS);
        assertNotNull(
                recorded,
                "certificate signing with addTimestamp=true should have contacted the TSA server");
        assertEquals("POST", recorded.getMethod());
        assertEquals("/tsr", recorded.getPath());
        assertEquals("application/timestamp-query", recorded.getHeader("Content-Type"));
    }

    @Test
    @DisplayName("addTimestamp=false never resolves a TSA URL or contacts a TSA server")
    void addTimestampFalseSkipsTsa() throws Exception {
        SignPDFWithCertRequest request = baseRequest(false);

        certSignController.signPDFWithCert(request, httpRequest);

        verify(tsaUrlResolver, org.mockito.Mockito.never()).resolveDefault();
        assertEquals(
                0,
                server.getRequestCount(),
                "no HTTP call should be made to the TSA server when addTimestamp is false");
    }
}
