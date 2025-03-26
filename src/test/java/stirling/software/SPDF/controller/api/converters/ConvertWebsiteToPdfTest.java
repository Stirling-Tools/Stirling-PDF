package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import stirling.software.SPDF.config.RuntimePathConfig;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.api.converters.UrlToPdfRequest;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;

public class ConvertWebsiteToPdfTest {

    @Mock private CustomPDFDocumentFactory mockPdfDocumentFactory;

    @Mock private RuntimePathConfig runtimePathConfig;

    private ApplicationProperties applicationProperties;

    private ConvertWebsiteToPDF convertWebsiteToPDF;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        applicationProperties = new ApplicationProperties();
        applicationProperties.getSystem().setEnableUrlToPDF(true);
        convertWebsiteToPDF =
                new ConvertWebsiteToPDF(
                        mockPdfDocumentFactory, runtimePathConfig, applicationProperties);
    }

    @Test
    public void test_exemption_is_thrown_when_invalid_url_format_provided() {

        String invalid_format_Url = "invalid-url";

        UrlToPdfRequest request = new UrlToPdfRequest();
        request.setUrlInput(invalid_format_Url);
        // Act
        IllegalArgumentException thrown =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> {
                            convertWebsiteToPDF.urlToPdf(request);
                        });
        // Assert
        assertEquals("Invalid URL format provided.", thrown.getMessage());
    }

    @Test
    public void test_exemption_is_thrown_when_url_is_not_reachable() {

        String unreachable_Url = "https://www.googleeeexyz.com";
        // Arrange
        UrlToPdfRequest request = new UrlToPdfRequest();
        request.setUrlInput(unreachable_Url);
        // Act
        IllegalArgumentException thrown =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> {
                            convertWebsiteToPDF.urlToPdf(request);
                        });
        // Assert
        assertEquals("URL is not reachable, please provide a valid URL.", thrown.getMessage());
    }
}
