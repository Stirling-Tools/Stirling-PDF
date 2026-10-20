package stirling.software.SPDF.controller.web;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class StatusControllerTest {

    private StatusController controller;

    @BeforeEach
    void setUp() {
        controller = new StatusController();
    }

    @Test
    void getStatus_returnsUpAndVersion() {
        ResponseEntity<?> response = controller.getStatus();

        assertEquals(HttpStatus.OK, response.getStatusCode());
        @SuppressWarnings("unchecked")
        Map<String, String> body = (Map<String, String>) response.getBody();
        assertNotNull(body);
        assertEquals("UP", body.get("status"));
        assertTrue(body.containsKey("version"));
    }

    @Test
    void getHealth_returnsUpAndVersion() {
        ResponseEntity<?> response = controller.getHealth();

        assertEquals(HttpStatus.OK, response.getStatusCode());
        @SuppressWarnings("unchecked")
        Map<String, String> body = (Map<String, String>) response.getBody();
        assertNotNull(body);
        assertEquals("UP", body.get("status"));
    }
}
