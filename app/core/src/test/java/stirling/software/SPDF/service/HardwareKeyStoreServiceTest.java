package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.SPDF.model.api.security.HardwareSigningCapabilities;

/** Unit tests for the gating / allowlist logic that protects the hardware signing paths. */
class HardwareKeyStoreServiceTest {

    private static final String PKCS11_PROP = "stirling.pkcs11.libraries";

    private HardwareKeyStoreService service(String machineType) {
        return new HardwareKeyStoreService(machineType);
    }

    @Test
    void isDesktop_trueOnlyForClientMachineTypes() {
        assertTrue(service("Client-windows").isDesktop());
        assertTrue(service("Client-mac").isDesktop());
        assertTrue(service("Client-unix").isDesktop());
        assertFalse(service("Server-jar").isDesktop());
        assertFalse(service("Docker").isDesktop());
        assertFalse(service(null).isDesktop());
    }

    @Test
    void isDesktop_trueInTauriModeEvenWithoutClientMachineType() {
        // The Tauri bundle sets STIRLING_PDF_TAURI_MODE=true while machineType stays Server-jar.
        String previous = System.getProperty("STIRLING_PDF_TAURI_MODE");
        try {
            System.setProperty("STIRLING_PDF_TAURI_MODE", "true");
            assertTrue(service("Server-jar").isDesktop());
            assertTrue(service(null).isDesktop());
        } finally {
            if (previous == null) {
                System.clearProperty("STIRLING_PDF_TAURI_MODE");
            } else {
                System.setProperty("STIRLING_PDF_TAURI_MODE", previous);
            }
        }
    }

    @Test
    void capabilities_notDesktop_reportsUnavailable() {
        HardwareSigningCapabilities caps = service("Server-jar").capabilities();
        assertFalse(caps.desktop());
        assertFalse(caps.windowsStoreSupported());
        assertFalse(caps.pkcs11Supported());
        assertTrue(caps.detectedLibraries().isEmpty());
    }

    @Test
    void capabilities_desktop_reportsOsName() {
        HardwareSigningCapabilities caps = service("Client-windows").capabilities();
        assertTrue(caps.desktop());
        assertFalse(caps.osName().isBlank());
    }

    @Test
    void assertLocalDesktop_rejectsNonDesktop() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getRemoteAddr()).thenReturn("127.0.0.1");
        assertThrows(
                IllegalArgumentException.class,
                () -> service("Server-jar").assertLocalDesktop(request));
    }

    @Test
    void assertLocalDesktop_rejectsRemoteCallerEvenOnDesktop() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        // 203.0.113.0/24 is TEST-NET-3 (RFC 5737) - never a real local interface address.
        when(request.getRemoteAddr()).thenReturn("203.0.113.5");
        assertThrows(
                IllegalArgumentException.class,
                () -> service("Client-windows").assertLocalDesktop(request));
    }

    @Test
    void assertLocalDesktop_allowsLoopbackOnDesktop() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getRemoteAddr()).thenReturn("127.0.0.1");
        assertDoesNotThrow(() -> service("Client-windows").assertLocalDesktop(request));
        // No servlet context (e.g. internal call) is also allowed.
        assertDoesNotThrow(() -> service("Client-windows").assertLocalDesktop(null));
    }

    @Test
    void isLocalRequest_acceptsLoopbackForms_rejectsRemote() {
        assertTrue(HardwareKeyStoreService.isLocalRequest("127.0.0.1"));
        assertTrue(HardwareKeyStoreService.isLocalRequest("::1"));
        assertTrue(HardwareKeyStoreService.isLocalRequest("0:0:0:0:0:0:0:1"));
        // IPv4-mapped IPv6 loopback - what Tomcat reports for the desktop webview.
        assertTrue(HardwareKeyStoreService.isLocalRequest("::ffff:127.0.0.1"));
        assertFalse(HardwareKeyStoreService.isLocalRequest("203.0.113.5"));
        assertFalse(HardwareKeyStoreService.isLocalRequest(null));
    }

    @Test
    void validateLibraryAllowed_blankPath_throws() {
        assertThrows(
                IllegalArgumentException.class,
                () -> service("Client-windows").validateLibraryAllowed("   "));
    }

    @Test
    void validateLibraryAllowed_unknownPath_throws() {
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        service("Client-windows")
                                .validateLibraryAllowed("/definitely/not/a/real/driver.so"));
    }

    @Test
    void validateLibraryAllowed_configuredPath_isAllowed(@TempDir Path tempDir) throws Exception {
        Path fakeDriver = Files.createFile(tempDir.resolve("fake-pkcs11.so"));
        String previous = System.getProperty(PKCS11_PROP);
        try {
            System.setProperty(PKCS11_PROP, fakeDriver.toString());
            HardwareKeyStoreService service = service("Client-windows");
            assertDoesNotThrow(() -> service.validateLibraryAllowed(fakeDriver.toString()));
            assertTrue(
                    service.detectPkcs11Libraries().stream()
                            .anyMatch(l -> l.path().equals(fakeDriver.toString())));
        } finally {
            if (previous == null) {
                System.clearProperty(PKCS11_PROP);
            } else {
                System.setProperty(PKCS11_PROP, previous);
            }
        }
    }
}
