package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
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
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.security.TimestampPdfRequest;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;

@DisplayName("TimestampController security tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TimestampControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private ApplicationProperties applicationProperties;

    @InjectMocks private TimestampController controller;

    private ApplicationProperties.Security security;
    private ApplicationProperties.Security.Timestamp tsConfig;
    private MockMultipartFile mockPdfFile;

    @BeforeEach
    void setUp() {
        security = new ApplicationProperties.Security();
        tsConfig = new ApplicationProperties.Security.Timestamp();
        security.setTimestamp(tsConfig);

        when(applicationProperties.getSecurity()).thenReturn(security);

        mockPdfFile =
                new MockMultipartFile(
                        "fileInput",
                        "test.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        new byte[] {0x25, 0x50, 0x44, 0x46}); // %PDF header
    }

    private TimestampPdfRequest createRequest(String tsaUrl) {
        TimestampPdfRequest request = new TimestampPdfRequest();
        request.setFileInput(mockPdfFile);
        request.setTsaUrl(tsaUrl);
        return request;
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
            when(pdfDocumentFactory.load(any(MockMultipartFile.class))).thenReturn(mockDoc);
            doAnswer(
                            inv -> {
                                ByteArrayOutputStream baos = inv.getArgument(0);
                                baos.write(new byte[] {0x25, 0x50, 0x44, 0x46});
                                return null;
                            })
                    .when(mockDoc)
                    .saveIncremental(any(ByteArrayOutputStream.class));
            doNothing().when(mockDoc).close();

            TimestampPdfRequest request = createRequest(presetUrl);

            // The method should NOT throw IllegalArgumentException for preset URLs
            // It may throw IOException when contacting the TSA — that's expected
            try {
                controller.timestampPdf(request);
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
            TimestampPdfRequest request = createRequest("http://evil.internal.corp/ssrf");

            IllegalArgumentException ex =
                    assertThrows(
                            IllegalArgumentException.class, () -> controller.timestampPdf(request));
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
            TimestampPdfRequest request = createRequest(ssrfUrl);

            assertThrows(
                    IllegalArgumentException.class,
                    () -> controller.timestampPdf(request),
                    "Should reject SSRF URL: " + ssrfUrl);
        }

        @Test
        @DisplayName("Should accept admin-configured custom URL")
        void shouldAcceptAdminCustomUrl() throws Exception {
            String customUrl = "https://internal-tsa.corp.com/timestamp";
            tsConfig.setCustomTsaUrls(new ArrayList<>(List.of(customUrl)));

            PDDocument mockDoc = mock(PDDocument.class);
            when(pdfDocumentFactory.load(any(MockMultipartFile.class))).thenReturn(mockDoc);
            doNothing().when(mockDoc).close();

            TimestampPdfRequest request = createRequest(customUrl);

            try {
                controller.timestampPdf(request);
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

            TimestampPdfRequest request =
                    createRequest("https://not-allowed-tsa.evil.com/timestamp");

            assertThrows(IllegalArgumentException.class, () -> controller.timestampPdf(request));
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
            when(pdfDocumentFactory.load(any(MockMultipartFile.class))).thenReturn(mockDoc);
            doNothing().when(mockDoc).close();

            TimestampPdfRequest request = createRequest(null);

            // Should not throw IllegalArgumentException — default is in presets
            try {
                controller.timestampPdf(request);
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
            when(pdfDocumentFactory.load(any(MockMultipartFile.class))).thenReturn(mockDoc);
            doNothing().when(mockDoc).close();

            TimestampPdfRequest request = createRequest("   ");

            try {
                controller.timestampPdf(request);
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

            TimestampPdfRequest request = createRequest("http://evil.com/ssrf");

            // Blank entries should not expand the allowlist
            assertThrows(IllegalArgumentException.class, () -> controller.timestampPdf(request));
        }

        @Test
        @DisplayName("Should reject file:// protocol in admin config")
        void shouldRejectFileProtocolInConfig() {
            tsConfig.setDefaultTsaUrl("file:///etc/passwd");
            tsConfig.setCustomTsaUrls(new ArrayList<>());

            TimestampPdfRequest request = createRequest(null);

            // file:// default should be filtered out, leaving no valid default
            // The request falls back to "file:///etc/passwd" which is not in allowed set
            assertThrows(Exception.class, () -> controller.timestampPdf(request));
        }

        @Test
        @DisplayName("Should reject ftp:// protocol in custom URLs")
        void shouldRejectFtpProtocolInCustomUrls() {
            tsConfig.setCustomTsaUrls(new ArrayList<>(List.of("ftp://internal-server/timestamp")));

            TimestampPdfRequest request = createRequest("ftp://internal-server/timestamp");

            assertThrows(IllegalArgumentException.class, () -> controller.timestampPdf(request));
        }
    }

    @Nested
    @DisplayName("Case-insensitive URL matching (TASK-12)")
    class CaseInsensitiveTests {

        @Test
        @DisplayName("Should match URLs regardless of case")
        void shouldMatchCaseInsensitive() throws Exception {
            PDDocument mockDoc = mock(PDDocument.class);
            when(pdfDocumentFactory.load(any(MockMultipartFile.class))).thenReturn(mockDoc);
            doNothing().when(mockDoc).close();

            TimestampPdfRequest request = createRequest("HTTP://TIMESTAMP.DIGICERT.COM");

            try {
                controller.timestampPdf(request);
            } catch (IllegalArgumentException e) {
                fail("Case-insensitive URL should match preset");
            } catch (Exception e) {
                // IOException expected
                assertFalse(e instanceof IllegalArgumentException);
            }
        }
    }
}
