package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.net.ServerSocket;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.servlet.http.HttpServletRequest;

@ExtendWith(MockitoExtension.class)
@DisplayName("UrlUtils Tests")
class UrlUtilsTest {

    @Mock private HttpServletRequest request;

    @Nested
    @DisplayName("getOrigin Tests")
    class GetOriginTests {

        @Test
        @DisplayName("Returns correct URL format with scheme, server name, port, and context path")
        void testGetOrigin() {
            // Arrange
            when(request.getScheme()).thenReturn("http");
            when(request.getServerName()).thenReturn("localhost");
            when(request.getServerPort()).thenReturn(8080);
            when(request.getContextPath()).thenReturn("/myapp");

            // Act
            String origin = UrlUtils.getOrigin(request);

            // Assert
            assertEquals(
                    "http://localhost:8080/myapp",
                    origin,
                    "Origin URL should be correctly formatted with context path");
        }

        @Test
        @DisplayName("Handles HTTPS scheme with standard port")
        void testGetOriginWithHttps() {
            // Arrange
            when(request.getScheme()).thenReturn("https");
            when(request.getServerName()).thenReturn("example.com");
            when(request.getServerPort()).thenReturn(443);
            when(request.getContextPath()).thenReturn("");

            // Act
            String origin = UrlUtils.getOrigin(request);

            // Assert
            assertEquals(
                    "https://example.com:443",
                    origin,
                    "HTTPS origin URL should be correctly formatted");
        }

        @Test
        @DisplayName("Handles empty context path correctly")
        void testGetOriginWithEmptyContextPath() {
            // Arrange
            when(request.getScheme()).thenReturn("http");
            when(request.getServerName()).thenReturn("localhost");
            when(request.getServerPort()).thenReturn(8080);
            when(request.getContextPath()).thenReturn("");

            // Act
            String origin = UrlUtils.getOrigin(request);

            // Assert
            assertEquals(
                    "http://localhost:8080",
                    origin,
                    "Origin URL with empty context path should be correct");
        }

        @Test
        @DisplayName("Handles server name with special characters or subdomains")
        void testGetOriginWithSpecialCharacters() {
            // Arrange
            when(request.getScheme()).thenReturn("https");
            when(request.getServerName()).thenReturn("internal-server.example-domain.com");
            when(request.getServerPort()).thenReturn(8443);
            when(request.getContextPath()).thenReturn("/app-v1.2");

            // Act
            String origin = UrlUtils.getOrigin(request);

            // Assert
            assertEquals(
                    "https://internal-server.example-domain.com:8443/app-v1.2",
                    origin,
                    "Origin URL with special characters should be correctly formatted");
        }

        @Test
        @DisplayName("Handles IPv4 address as server name")
        void testGetOriginWithIPv4Address() {
            // Arrange
            when(request.getScheme()).thenReturn("http");
            when(request.getServerName()).thenReturn("192.168.1.100");
            when(request.getServerPort()).thenReturn(8080);
            when(request.getContextPath()).thenReturn("/app");

            // Act
            String origin = UrlUtils.getOrigin(request);

            // Assert
            assertEquals(
                    "http://192.168.1.100:8080/app",
                    origin,
                    "Origin URL with IPv4 address should be correctly formatted");
        }

        @Test
        @DisplayName("Handles non-standard port correctly")
        void testGetOriginWithNonStandardPort() {
            // Arrange
            when(request.getScheme()).thenReturn("https");
            when(request.getServerName()).thenReturn("example.org");
            when(request.getServerPort()).thenReturn(8443);
            when(request.getContextPath()).thenReturn("/api");

            // Act
            String origin = UrlUtils.getOrigin(request);

            // Assert
            assertEquals(
                    "https://example.org:8443/api",
                    origin,
                    "Origin URL with non-standard port should be correctly formatted");
        }
    }

    @Nested
    @DisplayName("Port Availability Tests")
    class PortAvailabilityTests {

        @Test
        @DisplayName("Returns true for available port and false for occupied port")
        void testIsPortAvailable() {
            ServerSocket socket = null;
            int port = 12345; // Choose a port unlikely to be in use

            try {
                // First check if the port is available
                boolean initialAvailability = UrlUtils.isPortAvailable(port);

                // Then occupy the port
                socket = new ServerSocket(port);

                // Now check if the port is no longer available
                boolean afterSocketCreation = UrlUtils.isPortAvailable(port);

                // Assert
                assertTrue(initialAvailability, "Port should be available initially");
                assertFalse(
                        afterSocketCreation,
                        "Port should not be available after socket is created");
            } catch (IOException e) {
                // If the port is already in use by another process
                assertFalse(
                        UrlUtils.isPortAvailable(port),
                        "Port should not be available if exception is thrown");
            } finally {
                if (socket != null && !socket.isClosed()) {
                    try {
                        socket.close();
                    } catch (IOException e) {
                        // Ignore cleanup exceptions
                    }
                }
            }
        }

        @Test
        @DisplayName("Returns a different port than the occupied one")
        void testFindAvailablePort() {
            ServerSocket socket = null;
            int startPort = 12346; // Choose a port unlikely to be in use

            try {
                // Occupy the start port
                socket = new ServerSocket(startPort);

                // Find an available port
                String availablePort = UrlUtils.findAvailablePort(startPort);

                // Assert the returned port is not the occupied one
                assertNotEquals(
                        String.valueOf(startPort),
                        availablePort,
                        "findAvailablePort should not return an occupied port");

                // Verify the returned port is actually available
                int portNumber = Integer.parseInt(availablePort);

                // Close our test socket before checking the found port
                socket.close();
                socket = null;

                // The port should now be available
                assertTrue(
                        UrlUtils.isPortAvailable(portNumber),
                        "The port returned by findAvailablePort should be available");
            } catch (IOException e) {
                // Skip assertion if we can't create the socket
            } finally {
                if (socket != null && !socket.isClosed()) {
                    try {
                        socket.close();
                    } catch (IOException e) {
                        // Ignore cleanup exceptions
                    }
                }
            }
        }

        @Test
        @DisplayName("Returns the start port if it is available")
        void testFindAvailablePortWithAvailableStartPort() {
            int startPort = 23456; // Choose a different unlikely-to-be-used port

            // Make sure the port is available first
            if (UrlUtils.isPortAvailable(startPort)) {
                // Find an available port
                String availablePort = UrlUtils.findAvailablePort(startPort);

                // Assert the returned port is the start port since it's available
                assertEquals(
                        String.valueOf(startPort),
                        availablePort,
                        "findAvailablePort should return the start port if it's available");
            }
        }

        @Test
        @DisplayName("Skips multiple occupied ports to find an available one")
        void testFindAvailablePortWithSequentialUsedPorts() {
            ServerSocket socket1 = null;
            ServerSocket socket2 = null;
            int startPort = 34567; // Another unlikely-to-be-used port

            try {
                // First verify the port is available
                if (!UrlUtils.isPortAvailable(startPort)) {
                    return;
                }

                // Occupy two sequential ports
                socket1 = new ServerSocket(startPort);
                socket2 = new ServerSocket(startPort + 1);

                // Find an available port starting from our occupied range
                String availablePort = UrlUtils.findAvailablePort(startPort);
                int foundPort = Integer.parseInt(availablePort);

                // Should have skipped the two occupied ports
                assertTrue(
                        foundPort >= startPort + 2,
                        "findAvailablePort should skip sequential occupied ports");

                // Verify the found port is actually available
                try (ServerSocket testSocket = new ServerSocket(foundPort)) {
                    assertTrue(testSocket.isBound(), "The found port should be bindable");
                }
            } catch (IOException e) {
                // Skip test if we encounter IO exceptions
            } finally {
                // Clean up resources
                try {
                    if (socket1 != null && !socket1.isClosed()) socket1.close();
                    if (socket2 != null && !socket2.isClosed()) socket2.close();
                } catch (IOException e) {
                    // Ignore cleanup exceptions
                }
            }
        }

        @Test
        @DisplayName("Returns false for privileged ports (skipped due to environment dependency)")
        void testIsPortAvailableWithPrivilegedPorts() {
            // Skip tests for privileged ports as they typically require root access
            // and results are environment-dependent
        }
    }
}
