package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

public class RequestUriUtilTest {

    @Test
    public void testIsStaticResource() {
        assertTrue(RequestUriUtil.isStaticResource("/css/styles.css"));
        assertTrue(RequestUriUtil.isStaticResource("/js/script.js"));
        assertTrue(RequestUriUtil.isStaticResource("/images/logo.png"));
        assertTrue(RequestUriUtil.isStaticResource("/public/index.html"));
        assertTrue(RequestUriUtil.isStaticResource("/pdfjs/pdf.worker.js"));
        assertTrue(RequestUriUtil.isStaticResource("/api/v1/info/status"));
        assertTrue(RequestUriUtil.isStaticResource("/some-path/icon.svg"));
        assertFalse(RequestUriUtil.isStaticResource("/api/v1/users"));
        assertFalse(RequestUriUtil.isStaticResource("/api/v1/orders"));
        assertFalse(RequestUriUtil.isStaticResource("/"));
        assertTrue(RequestUriUtil.isStaticResource("/login"));
        assertFalse(RequestUriUtil.isStaticResource("/register"));
        assertFalse(RequestUriUtil.isStaticResource("/api/v1/products"));
    }
}
