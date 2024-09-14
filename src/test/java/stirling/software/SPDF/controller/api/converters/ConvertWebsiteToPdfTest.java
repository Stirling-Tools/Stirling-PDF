package stirling.software.SPDF.controller.api.converters;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.ResponseEntity;

import stirling.software.SPDF.controller.api.RearrangePagesPDFController;
import stirling.software.SPDF.model.api.converters.UrlToPdfRequest;
import stirling.software.SPDF.service.CustomPDDocumentFactory;

import static org.junit.jupiter.api.Assertions.*;

public class ConvertWebsiteToPdfTest {


    @Mock
    private CustomPDDocumentFactory mockPdfDocumentFactory;

    private ConvertWebsiteToPDF convertWebsiteToPDF;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        convertWebsiteToPDF = new ConvertWebsiteToPDF(mockPdfDocumentFactory);
    }

    @Test
    public void test_exemption_is_thrown_when_invalid_url_format_provided() {

        String invalid_format_Url = "invalid-url";

        UrlToPdfRequest request = new UrlToPdfRequest();
        request.setUrlInput(invalid_format_Url);
        // Act
        IllegalArgumentException thrown = assertThrows(IllegalArgumentException.class, () -> {
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
        IllegalArgumentException thrown = assertThrows(IllegalArgumentException.class, () -> {
            convertWebsiteToPDF.urlToPdf(request);
        });
        // Assert
        assertEquals("URL is not reachable, please provide a valid URL.", thrown.getMessage());
    }
}
