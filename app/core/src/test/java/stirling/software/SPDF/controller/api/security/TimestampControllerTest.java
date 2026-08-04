package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.io.File;
import java.io.OutputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@DisplayName("TimestampController security tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TimestampControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private ApplicationProperties applicationProperties;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private TimestampController controller;

    private ApplicationProperties.Security security;
    private ApplicationProperties.Security.Timestamp tsConfig;
    private FileUpload mockPdfFile;

    @BeforeEach
    void setUp() throws Exception {
        security = new ApplicationProperties.Security();
        tsConfig = new ApplicationProperties.Security.Timestamp();
        security.setTimestamp(tsConfig);

        when(applicationProperties.getSecurity()).thenReturn(security);

        when(tempFileManager.createManagedTempFile(anyString()))
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

        mockPdfFile =
                TestFileUploads.of(
                        new byte[] {0x25, 0x50, 0x44, 0x46}, // %PDF header
                        "test.pdf",
                        "application/pdf");
    }

    @Nested
    @DisplayName("URL Allowlist Validation")
    class AllowlistTests {

        @ParameterizedTest
        @DisplayName("Should accept built-in preset URLs")
        @ValueSource(
                strings = {
                    "http://timestamp.digicert.com",
                    "http://timestamp.sectigo.com",
                    "http://ts.ssl.com",
                    "https://freetsa.org/tsr",
                    "http://tsa.mesign.com"
                })
        void shouldAcceptPresetUrls(String presetUrl) throws Exception {
            // Mock PDF loading to avoid actual TSA call — we only test validation here
            PDDocument mockDoc = mock(PDDocument.class);
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDoc);
            doNothing().when(mockDoc).saveIncremental(any(OutputStream.class));
            doNothing().when(mockDoc).close();

            // The method should NOT throw IllegalArgumentException for preset URLs
            // It may throw IOException when contacting the TSA — that's expected
            try {
                controller.timestampPdf(mockPdfFile, null, presetUrl);
            } catch (IllegalArgumentException e) {
                fail("Preset URL should be in the allowlist: " + presetUrl);
            } catch (Exception e) {
                // IOException from TSA contact is expected in test env — validation passed
                assertFalse(
                        e instanceof IllegalArgumentException,
                        "Should not reject preset URL: " + presetUrl);
            }
        }

        @Test
        @DisplayName("Should reject arbitrary URL not in allowlist")
        void shouldRejectArbitraryUrl() {
            IllegalArgumentException ex =
                    assertThrows(
                            IllegalArgumentException.class,
                            () ->
                                    controller.timestampPdf(
                                            mockPdfFile, null, "http://evil.internal.corp/ssrf"));
            assertTrue(ex.getMessage().contains("not in the allowed list"));
        }

        @ParameterizedTest
        @DisplayName("Should reject SSRF-prone URLs")
        @ValueSource(
                strings = {
                    "http://localhost/timestamp",
                    "http://127.0.0.1:8080/internal",
                    "http://192.168.1.1/admin",
                    "http://10.0.0.1/metadata",
                    "http://169.254.169.254/latest/meta-data",
                    "file:///etc/passwd",
                    "ftp://internal-server/data",
                    "gopher://internal:25/",
                })
        void shouldRejectSsrfUrls(String ssrfUrl) {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> controller.timestampPdf(mockPdfFile, null, ssrfUrl),
                    "Should reject SSRF URL: " + ssrfUrl);
        }

        @Test
        @DisplayName("Should accept admin-configured custom URL")
        void shouldAcceptAdminCustomUrl() throws Exception {
            String customUrl = "https://internal-tsa.corp.com/timestamp";
            tsConfig.setCustomTsaUrls(new ArrayList<>(List.of(customUrl)));

            PDDocument mockDoc = mock(PDDocument.class);
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDoc);
            doNothing().when(mockDoc).close();

            try {
                controller.timestampPdf(mockPdfFile, null, customUrl);
            } catch (IllegalArgumentException e) {
                fail("Admin-configured custom URL should be accepted: " + customUrl);
            } catch (Exception e) {
                // IOException from TSA contact is expected
                assertFalse(e instanceof IllegalArgumentException);
            }
        }

        @Test
        @DisplayName("Should reject URL not in admin custom list")
        void shouldRejectUrlNotInAdminList() {
            tsConfig.setCustomTsaUrls(
                    new ArrayList<>(List.of("https://allowed-tsa.corp.com/timestamp")));

            assertThrows(
                    IllegalArgumentException.class,
                    () ->
                            controller.timestampPdf(
                                    mockPdfFile,
                                    null,
                                    "https://not-allowed-tsa.evil.com/timestamp"));
        }
    }

    @Nested
    @DisplayName("Default TSA URL Fallback")
    class DefaultFallbackTests {

        @Test
        @DisplayName("Should use config default when tsaUrl is null")
        void shouldFallbackToConfigDefault() throws Exception {
            tsConfig.setDefaultTsaUrl("http://timestamp.digicert.com");

            PDDocument mockDoc = mock(PDDocument.class);
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDoc);
            doNothing().when(mockDoc).close();

            // Should not throw IllegalArgumentException — default is in presets
            try {
                controller.timestampPdf(mockPdfFile, null, null);
            } catch (IllegalArgumentException e) {
                fail("Default TSA URL should be accepted");
            } catch (Exception e) {
                // IOException expected
            }
        }

        @Test
        @DisplayName("Should use config default when tsaUrl is blank")
        void shouldFallbackToConfigDefaultWhenBlank() throws Exception {
            tsConfig.setDefaultTsaUrl("http://timestamp.digicert.com");

            PDDocument mockDoc = mock(PDDocument.class);
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDoc);
            doNothing().when(mockDoc).close();

            try {
                controller.timestampPdf(mockPdfFile, null, "   ");
            } catch (IllegalArgumentException e) {
                fail("Should fallback to config default when blank");
            } catch (Exception e) {
                // IOException expected
            }
        }
    }

    @Nested
    @DisplayName("Config URL Validation (TASK-6)")
    class ConfigValidationTests {

        @Test
        @DisplayName("Should filter blank entries from admin custom URLs")
        void shouldFilterBlankCustomUrls() {
            List<String> customUrls = new ArrayList<>(List.of("", "  ", "http://valid-tsa.com/ts"));
            tsConfig.setCustomTsaUrls(customUrls);

            // Blank entries should not expand the allowlist
            assertThrows(
                    IllegalArgumentException.class,
                    () -> controller.timestampPdf(mockPdfFile, null, "http://evil.com/ssrf"));
        }

        @Test
        @DisplayName("Should reject file:// protocol in admin config")
        void shouldRejectFileProtocolInConfig() {
            tsConfig.setDefaultTsaUrl("file:///etc/passwd");
            tsConfig.setCustomTsaUrls(new ArrayList<>());

            // file:// default should be filtered out, leaving no valid default
            // The request falls back to "file:///etc/passwd" which is not in allowed set
            assertThrows(Exception.class, () -> controller.timestampPdf(mockPdfFile, null, null));
        }

        @Test
        @DisplayName("Should reject ftp:// protocol in custom URLs")
        void shouldRejectFtpProtocolInCustomUrls() {
            tsConfig.setCustomTsaUrls(new ArrayList<>(List.of("ftp://internal-server/timestamp")));

            assertThrows(
                    IllegalArgumentException.class,
                    () ->
                            controller.timestampPdf(
                                    mockPdfFile, null, "ftp://internal-server/timestamp"));
        }
    }

    @Nested
    @DisplayName("Case-insensitive URL matching (TASK-12)")
    class CaseInsensitiveTests {

        @Test
        @DisplayName("Should match URLs regardless of case")
        void shouldMatchCaseInsensitive() throws Exception {
            PDDocument mockDoc = mock(PDDocument.class);
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDoc);
            doNothing().when(mockDoc).close();

            try {
                controller.timestampPdf(mockPdfFile, null, "HTTP://TIMESTAMP.DIGICERT.COM");
            } catch (IllegalArgumentException e) {
                fail("Case-insensitive URL should match preset");
            } catch (Exception e) {
                // IOException expected
                assertFalse(e instanceof IllegalArgumentException);
            }
        }
    }
}
