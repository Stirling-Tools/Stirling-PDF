package stirling.software.SPDF.utils;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

public class RequestUriUtilsTest {

    @Test
    public void testIsStaticResource() {
        assertTrue(RequestUriUtils.isStaticResource("/css/styles.css"));
        assertTrue(RequestUriUtils.isStaticResource("/js/script.js"));
        assertTrue(RequestUriUtils.isStaticResource("/images/logo.png"));
        assertTrue(RequestUriUtils.isStaticResource("/public/index.html"));
        assertTrue(RequestUriUtils.isStaticResource("/pdfjs/pdf.worker.js"));
        assertTrue(RequestUriUtils.isStaticResource("/api/v1/info/status"));
        assertTrue(RequestUriUtils.isStaticResource("/some-path/icon.svg"));
        assertFalse(RequestUriUtils.isStaticResource("/api/v1/users"));
        assertFalse(RequestUriUtils.isStaticResource("/api/v1/orders"));
        assertFalse(RequestUriUtils.isStaticResource("/"));
        assertFalse(RequestUriUtils.isStaticResource("/login"));
        assertFalse(RequestUriUtils.isStaticResource("/register"));
        assertFalse(RequestUriUtils.isStaticResource("/api/v1/products"));
    }
}
