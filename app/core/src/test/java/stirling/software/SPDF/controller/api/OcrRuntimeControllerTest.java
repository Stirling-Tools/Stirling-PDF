package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import stirling.software.SPDF.service.OcrRuntimeService;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;

/**
 * The engine and the language models are shared by every user of the server, so with login on only
 * an admin may change them. The desktop starts the backend with login off, and there the one person
 * at the machine must still be able to install OCR.
 */
class OcrRuntimeControllerTest {

    private OcrRuntimeService service;
    private ApplicationProperties properties;
    private UserServiceInterface users;

    @BeforeEach
    void setUp() {
        service = mock(OcrRuntimeService.class);
        properties = new ApplicationProperties();
        users = mock(UserServiceInterface.class);
    }

    private static OcrRuntimeController.OcrLanguagesRequest installing(String code) {
        OcrRuntimeController.OcrLanguagesRequest request =
                new OcrRuntimeController.OcrLanguagesRequest();
        request.setInstall(List.of(code));
        request.setRemove(List.of("deu"));
        return request;
    }

    @Test
    void withLoginOnAUserWhoIsNotAdminChangesNothing() throws Exception {
        properties.getSecurity().setEnableLogin(true);
        when(users.isCurrentUserAdmin()).thenReturn(false);
        OcrRuntimeController controller = new OcrRuntimeController(service, properties, users);

        assertEquals(HttpStatus.FORBIDDEN, controller.installEngine().getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, controller.languages(installing("spa")).getStatusCode());

        verify(service, never()).installEngine();
        verify(service, never()).installLanguage(anyString());
        verify(service, never()).removeLanguage(anyString());
    }

    @Test
    void withLoginOnAnAdminChangesTheRuntime() throws Exception {
        properties.getSecurity().setEnableLogin(true);
        when(users.isCurrentUserAdmin()).thenReturn(true);
        OcrRuntimeController controller = new OcrRuntimeController(service, properties, users);

        assertEquals(HttpStatus.OK, controller.installEngine().getStatusCode());
        assertEquals(HttpStatus.OK, controller.languages(installing("spa")).getStatusCode());

        verify(service).installEngine();
        verify(service).installLanguage("spa");
        verify(service).removeLanguage("deu");
    }

    @Test
    void withLoginOffAsOnTheDesktopAnyoneChangesTheRuntime() throws Exception {
        properties.getSecurity().setEnableLogin(false);
        OcrRuntimeController controller = new OcrRuntimeController(service, properties, null);

        assertEquals(HttpStatus.OK, controller.installEngine().getStatusCode());
        assertEquals(HttpStatus.OK, controller.languages(installing("spa")).getStatusCode());

        verify(service).installEngine();
        verify(service).installLanguage("spa");
    }

    @Test
    void theStatusStaysReadableForEveryone() throws Exception {
        properties.getSecurity().setEnableLogin(true);
        when(users.isCurrentUserAdmin()).thenReturn(false);
        when(service.loadManifest()).thenThrow(new IOException("catalogue unreachable"));
        OcrRuntimeController controller = new OcrRuntimeController(service, properties, users);

        assertEquals(HttpStatus.OK, controller.status().getStatusCode());
    }
}
