package stirling.software.SPDF.controller.api.converters;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import stirling.software.SPDF.model.api.converters.UrlToPdfRequest;
import static org.junit.jupiter.api.Assertions.*;

public class ConvertWebsiteToPdfTest {
    @Test
    public void test_exemption_is_thrown_when_invalid_url_format_provided() {

        String invalid_format_Url = "invalid-url";
        // Arrange
        ConvertWebsiteToPDF convertWebsiteToPDF = new ConvertWebsiteToPDF();
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

        String unreachable_Url = "https://www.googleeee.com";
        // Arrange
        ConvertWebsiteToPDF convertWebsiteToPDF = new ConvertWebsiteToPDF();
        UrlToPdfRequest request = new UrlToPdfRequest();
        request.setUrlInput(unreachable_Url);
        // Act
        IllegalArgumentException thrown = assertThrows(IllegalArgumentException.class, () -> {
            convertWebsiteToPDF.urlToPdf(request);
        });
        // Assert
        assertEquals("URL is not reachable, please provide a valid URL.", thrown.getMessage());
    }

    @Test
    public void test_no_exemption_is_thrown_when_valid_url_format_provided() {

        String valid_format_Url = "https://www.google.com";
        // Arrange
        ConvertWebsiteToPDF convertWebsiteToPDF = new ConvertWebsiteToPDF();
        UrlToPdfRequest request = new UrlToPdfRequest();
        request.setUrlInput(valid_format_Url);
        // Act
        assertDoesNotThrow(() -> {
            convertWebsiteToPDF.urlToPdf(request);
        });
    }

    @Test void test_pdf_bytes_are_returned_when_valid_url_provided() {
        String valid_format_Url = "https://www.google.com";
        // Arrange
        ConvertWebsiteToPDF convertWebsiteToPDF = new ConvertWebsiteToPDF();
        UrlToPdfRequest request = new UrlToPdfRequest();
        request.setUrlInput(valid_format_Url);
        // Act
        ResponseEntity<byte[]> pdfBytes = assertDoesNotThrow(() -> {
            return convertWebsiteToPDF.urlToPdf(request);
        });
        // Assert
        assertNotNull(pdfBytes.getBody());
    }

}
