package stirling.software.proprietary.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;

import stirling.software.proprietary.model.api.signature.SavedSignatureRequest;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.SignatureService;

/**
 * MIGRATION (Spring -> Quarkus): {@code SignatureController} is now a JAX-RS resource returning
 * {@link Response}. The handlers RETURN their status codes (forbidden / no-content) rather than
 * letting Spring map a thrown exception, so the former MockMvc {@code status()} matchers become
 * {@code resp.getStatus()} assertions. JSON request bodies are passed as the typed DTO / {@code
 * Map<String,String>} the endpoints declare instead of raw JSON strings.
 */
@ExtendWith(MockitoExtension.class)
class SignatureControllerTest {

    @Mock private SignatureService signatureService;
    @Mock private UserService userService;

    private SignatureController controller;

    @BeforeEach
    void setUp() {
        controller = new SignatureController(signatureService, userService);
    }

    @Test
    void saveSignatureForbidsSharedScopeForNonAdmin() throws Exception {
        when(userService.getCurrentUsername()).thenReturn("user1");
        when(userService.isCurrentUserAdmin()).thenReturn(false);

        SavedSignatureRequest request = new SavedSignatureRequest();
        request.setId("sig1");
        request.setScope("shared");
        request.setDataUrl("data:image/png;base64,AAAA");

        Response resp = controller.saveSignature(request);

        assertEquals(Response.Status.FORBIDDEN.getStatusCode(), resp.getStatus());
        verify(signatureService, never()).saveSignature(any(), any());
    }

    @Test
    void updateSignatureLabelForbidsSharedSignatureForNonAdmin() throws Exception {
        when(userService.getCurrentUsername()).thenReturn("user1");
        when(userService.isCurrentUserAdmin()).thenReturn(false);
        when(signatureService.isSharedSignature("sig123")).thenReturn(true);

        Response resp = controller.updateSignatureLabel("sig123", Map.of("label", "new label"));

        assertEquals(Response.Status.FORBIDDEN.getStatusCode(), resp.getStatus());
        verify(signatureService, never()).updateSignatureLabel(any(), any(), any());
    }

    @Test
    void updateSignatureLabelAllowsPersonalSignatureForNonAdmin() throws Exception {
        when(userService.getCurrentUsername()).thenReturn("user1");
        when(userService.isCurrentUserAdmin()).thenReturn(false);
        when(signatureService.isSharedSignature("sig123")).thenReturn(false);

        Response resp = controller.updateSignatureLabel("sig123", Map.of("label", "new label"));

        assertEquals(Response.Status.NO_CONTENT.getStatusCode(), resp.getStatus());
        verify(signatureService).updateSignatureLabel(eq("user1"), eq("sig123"), eq("new label"));
    }
}
