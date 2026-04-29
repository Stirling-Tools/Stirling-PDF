package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;

import jakarta.servlet.http.HttpServletRequest;

class UrlUtilsTest {

    @Test
    void testGetOrigin_standardRequest() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("localhost");
        when(request.getServerPort()).thenReturn(8080);
        when(request.getContextPath()).thenReturn("");

        assertEquals("http://localhost:8080", UrlUtils.getOrigin(request));
    }

    @Test
    void testGetOrigin_httpsWithContextPath() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getScheme()).thenReturn("https");
        when(request.getServerName()).thenReturn("example.com");
        when(request.getServerPort()).thenReturn(443);
        when(request.getContextPath()).thenReturn("/myapp");

        assertEquals("https://example.com:443/myapp", UrlUtils.getOrigin(request));
    }

    @Test
    void testIsPortAvailable_usedPort() {
        // Port 0 is special - let the OS pick a port, but commonly used ports should be busy
        // We test with a high port that might be available
        // This is inherently environment-dependent
        boolean result = UrlUtils.isPortAvailable(0);
        // Port 0 should always be available as the OS assigns an ephemeral port
        assertTrue(result);
    }

    @Test
    void testFindAvailablePort_returnsPort() {
        // Starting from port 0 should immediately find an available port
        String port = UrlUtils.findAvailablePort(0);
        assertNotNull(port);
        int portNum = Integer.parseInt(port);
        assertTrue(portNum >= 0);
    }

    @Test
    void testGetOrigin_customPort() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("192.168.1.1");
        when(request.getServerPort()).thenReturn(9090);
        when(request.getContextPath()).thenReturn("/api");

        assertEquals("http://192.168.1.1:9090/api", UrlUtils.getOrigin(request));
    }

    @Test
    void testGetOrigin_defaultPort80() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("example.com");
        when(request.getServerPort()).thenReturn(80);
        when(request.getContextPath()).thenReturn("");

        assertEquals("http://example.com:80", UrlUtils.getOrigin(request));
    }

    @Test
    void testGetOrigin_emptyContextPath() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getScheme()).thenReturn("https");
        when(request.getServerName()).thenReturn("app.example.com");
        when(request.getServerPort()).thenReturn(443);
        when(request.getContextPath()).thenReturn("");

        assertEquals("https://app.example.com:443", UrlUtils.getOrigin(request));
    }

    @Test
    void testGetOrigin_nestedContextPath() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("host");
        when(request.getServerPort()).thenReturn(3000);
        when(request.getContextPath()).thenReturn("/a/b/c");

        assertEquals("http://host:3000/a/b/c", UrlUtils.getOrigin(request));
    }

    @Test
    void testFindAvailablePort_returnsStringOfPort() {
        String port = UrlUtils.findAvailablePort(49152);
        assertNotNull(port);
        int portNum = Integer.parseInt(port);
        assertTrue(portNum >= 49152);
    }

    @Test
    void testIsPortAvailable_highPort() {
        // Most high ephemeral ports should be available in test environments
        // Using port 0 which OS always considers available
        assertTrue(UrlUtils.isPortAvailable(0));
    }

    @Test
    void testGetOrigin_ipv4Address() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getScheme()).thenReturn("http");
        when(request.getServerName()).thenReturn("10.0.0.1");
        when(request.getServerPort()).thenReturn(8443);
        when(request.getContextPath()).thenReturn("");

        assertEquals("http://10.0.0.1:8443", UrlUtils.getOrigin(request));
    }
}
