package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import stirling.software.SPDF.model.api.converters.UrlToPdfRequest;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;

@DisplayName("ConvertWebsiteToPDF Tests")
public class ConvertWebsiteToPdfTest {

    @Mock private CustomPDFDocumentFactory mockPdfDocumentFactory;

    @Mock private RuntimePathConfig runtimePathConfig;

    private ConvertWebsiteToPDF convertWebsiteToPDF;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        ApplicationProperties applicationProperties = new ApplicationProperties();
        applicationProperties.getSystem().setEnableUrlToPDF(true);
        convertWebsiteToPDF =
            new ConvertWebsiteToPDF(
                mockPdfDocumentFactory, runtimePathConfig, applicationProperties);
    }

    @Nested
    @DisplayName("URL Validation Tests")
    class UrlValidationTests {

        @Test
        @DisplayName("Throws IllegalArgumentException for invalid URL format")
        void testExceptionThrown_WhenInvalidUrlFormatProvided() {
            // Arrange
            String invalidFormatUrl = "invalid-url";
            UrlToPdfRequest request = new UrlToPdfRequest();
            request.setUrlInput(invalidFormatUrl);

            // Act
            IllegalArgumentException thrown =
                assertThrows(
                    IllegalArgumentException.class,
                    () -> convertWebsiteToPDF.urlToPdf(request),
                    "Should throw IllegalArgumentException for invalid URL format");

            // Assert
            assertEquals("Invalid URL format: provided format is invalid", thrown.getMessage(),
                "Exception message should indicate invalid URL format");
        }

        @Test
        @DisplayName("Throws IllegalArgumentException for unreachable URL")
        void testExceptionThrown_WhenUrlIsNotReachable() {
            // Arrange
            String unreachableUrl = "https://www.googleeeexyz.com";
            UrlToPdfRequest request = new UrlToPdfRequest();
            request.setUrlInput(unreachableUrl);

            // Act
            IllegalArgumentException thrown =
                assertThrows(
                    IllegalArgumentException.class,
                    () -> convertWebsiteToPDF.urlToPdf(request),
                    "Should throw IllegalArgumentException for unreachable URL");

            // Assert
            assertEquals("URL is not reachable, please provide a valid URL", thrown.getMessage(),
                "Exception message should indicate URL is not reachable");
        }

        @Test
        @DisplayName("Throws IllegalArgumentException for empty URL input")
        void testExceptionThrown_WhenUrlIsEmpty() {
            // Arrange
            UrlToPdfRequest request = new UrlToPdfRequest();
            request.setUrlInput("");

            // Act
            IllegalArgumentException thrown =
                assertThrows(
                    IllegalArgumentException.class,
                    () -> convertWebsiteToPDF.urlToPdf(request),
                    "Should throw IllegalArgumentException for empty URL");

            // Assert
            assertEquals("Invalid URL format: provided format is invalid", thrown.getMessage(),
                "Exception message should indicate invalid URL format");
        }
    }

    @Nested
    @DisplayName("Configuration Validation Tests")
    class ConfigurationValidationTests {

        @Test
        @DisplayName("Throws IllegalArgumentException when URL to PDF conversion is disabled")
        void testExceptionThrown_WhenUrlToPdfIsDisabled() {
            // Arrange
            ApplicationProperties applicationProperties = new ApplicationProperties();
            applicationProperties.getSystem().setEnableUrlToPDF(false);
            ConvertWebsiteToPDF disabledConvertWebsiteToPDF =
                new ConvertWebsiteToPDF(
                    mockPdfDocumentFactory, runtimePathConfig, applicationProperties);

            UrlToPdfRequest request = new UrlToPdfRequest();
            request.setUrlInput("https://www.example.com");

            // Act
            IllegalArgumentException thrown =
                assertThrows(
                    IllegalArgumentException.class,
                    () -> disabledConvertWebsiteToPDF.urlToPdf(request),
                    "Should throw IllegalArgumentException when URL to PDF is disabled");

            // Assert
            assertEquals("This endpoint has been disabled by the admin", thrown.getMessage(),
                "Exception message should indicate endpoint is disabled");
        }
    }
}
