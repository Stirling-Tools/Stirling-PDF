package stirling.software.SPDF.utils;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import static org.junit.jupiter.api.Assertions.assertEquals;

public class UrlUtilsTest {

    @Test
    void testGetOrigin() {
        // Mock HttpServletRequest
        HttpServletRequest request = Mockito.mock(HttpServletRequest.class);
        Mockito.when(request.getScheme()).thenReturn("http");
        Mockito.when(request.getServerName()).thenReturn("localhost");
        Mockito.when(request.getServerPort()).thenReturn(8080);
        Mockito.when(request.getContextPath()).thenReturn("/myapp");

        // Call the method under test
        String origin = UrlUtils.getOrigin(request);

        // Assert the result
        assertEquals("http://localhost:8080/myapp", origin);
    }
}
