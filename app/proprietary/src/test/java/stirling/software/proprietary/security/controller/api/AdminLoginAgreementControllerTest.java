package stirling.software.proprietary.security.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import stirling.software.common.service.LoginAgreementService;
import stirling.software.proprietary.security.controller.api.AdminLoginAgreementController.DisclaimerContentRequest;

@ExtendWith(MockitoExtension.class)
class AdminLoginAgreementControllerTest {

    @Mock LoginAgreementService loginAgreementService;

    @InjectMocks AdminLoginAgreementController controller;

    @Test
    void listDelegatesToService() {
        when(loginAgreementService.listLocalesWithContent()).thenReturn(Set.of("en-GB", "fr-FR"));
        assertEquals(Set.of("en-GB", "fr-FR"), controller.listLocales());
    }

    @Test
    void readReturnsContentForValidLocale() {
        when(loginAgreementService.readRawForLocale("fr-FR")).thenReturn("# Avis");
        ResponseEntity<?> resp = controller.read("fr-FR");
        assertEquals(HttpStatus.OK, resp.getStatusCode());
    }

    @Test
    void readReturnsBadRequestForInvalidLocale() {
        // Service returns null for an invalid locale.
        when(loginAgreementService.readRawForLocale("../escape")).thenReturn(null);
        ResponseEntity<?> resp = controller.read("../escape");
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
    }

    @Test
    void writeDelegatesAndReturnsNoContent() throws IOException {
        ResponseEntity<Void> resp = controller.write("fr-FR", new DisclaimerContentRequest("# Hi"));
        assertEquals(HttpStatus.NO_CONTENT, resp.getStatusCode());
        verify(loginAgreementService).writeForLocale("fr-FR", "# Hi");
    }

    @Test
    void writeReturnsBadRequestOnInvalidLocale() throws IOException {
        doThrow(new IllegalArgumentException("Invalid locale"))
                .when(loginAgreementService)
                .writeForLocale(eq("../escape"), eq("x"));
        ResponseEntity<Void> resp =
                controller.write("../escape", new DisclaimerContentRequest("x"));
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
    }

    @Test
    void writeReturnsServerErrorOnIoException() throws IOException {
        doThrow(new IOException("disk full"))
                .when(loginAgreementService)
                .writeForLocale(eq("fr-FR"), eq("x"));
        ResponseEntity<Void> resp = controller.write("fr-FR", new DisclaimerContentRequest("x"));
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, resp.getStatusCode());
    }
}
