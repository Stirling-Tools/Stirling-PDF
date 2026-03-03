package stirling.software.proprietary.controller.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.SignatureService;

@ExtendWith(MockitoExtension.class)
class SignatureControllerTest {

    @Mock private SignatureService signatureService;
    @Mock private UserService userService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        SignatureController controller = new SignatureController(signatureService, userService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    void saveSignatureForbidsSharedScopeForNonAdmin() throws Exception {
        when(userService.getCurrentUsername()).thenReturn("user1");
        when(userService.isCurrentUserAdmin()).thenReturn(false);

        mockMvc.perform(
                        post("/api/v1/proprietary/signatures")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "id": "sig1",
                                          "scope": "shared",
                                          "dataUrl": "data:image/png;base64,AAAA"
                                        }
                                        """))
                .andExpect(status().isForbidden());

        verify(signatureService, never()).saveSignature(any(), any());
    }

    @Test
    void updateSignatureLabelForbidsSharedSignatureForNonAdmin() throws Exception {
        when(userService.getCurrentUsername()).thenReturn("user1");
        when(userService.isCurrentUserAdmin()).thenReturn(false);
        when(signatureService.isSharedSignature("sig123")).thenReturn(true);

        mockMvc.perform(
                        post("/api/v1/proprietary/signatures/sig123/label")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"label\":\"new label\"}"))
                .andExpect(status().isForbidden());

        verify(signatureService, never()).updateSignatureLabel(any(), any(), any());
    }

    @Test
    void updateSignatureLabelAllowsPersonalSignatureForNonAdmin() throws Exception {
        when(userService.getCurrentUsername()).thenReturn("user1");
        when(userService.isCurrentUserAdmin()).thenReturn(false);
        when(signatureService.isSharedSignature("sig123")).thenReturn(false);

        mockMvc.perform(
                        post("/api/v1/proprietary/signatures/sig123/label")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"label\":\"new label\"}"))
                .andExpect(status().isNoContent());

        verify(signatureService).updateSignatureLabel(eq("user1"), eq("sig123"), eq("new label"));
    }
}
