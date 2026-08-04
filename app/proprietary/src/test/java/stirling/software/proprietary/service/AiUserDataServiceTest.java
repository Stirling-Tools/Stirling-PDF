package stirling.software.proprietary.service;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.io.IOException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

/**
 * Tests the wiring of {@link AiUserDataService}: the path/userId combination forwarded to the
 * engine, plus the swallowing-not-throwing behaviour for engine failures. Doesn't try to assert
 * async dispatch - the former Spring {@code @Async} has no Quarkus equivalent and the method now
 * runs synchronously, so a unit-level test exercises it directly.
 *
 * <p>MIGRATION (Spring -> Quarkus): engine HTTP failures arrive as a JAX-RS {@link
 * WebApplicationException} (was Spring's {@code ResponseStatusException}); the service swallows it
 * the same way.
 */
@ExtendWith(MockitoExtension.class)
class AiUserDataServiceTest {

    private static final String PURGE_PATH = "/api/v1/documents/by-owner";

    @Mock private AiEngineClient aiEngineClient;

    private AiUserDataService service;

    @BeforeEach
    void setUp() {
        service = new AiUserDataService(aiEngineClient);
    }

    @Test
    void purgesUnderTheGivenUserIdOnTheByOwnerEndpoint() throws IOException {
        service.purgeUserDocuments("alice");
        verify(aiEngineClient, times(1)).delete(eq(PURGE_PATH), eq("alice"));
    }

    @Test
    void noOpWhenUserIdIsNull() throws IOException {
        service.purgeUserDocuments(null);
        verify(aiEngineClient, never()).delete(eq(PURGE_PATH), eq(null));
    }

    @Test
    void noOpWhenUserIdIsBlank() throws IOException {
        service.purgeUserDocuments("   ");
        verify(aiEngineClient, never()).delete(eq(PURGE_PATH), eq("   "));
    }

    @Test
    void swallowsIoExceptionFromEngine() throws IOException {
        doThrow(new IOException("connection refused"))
                .when(aiEngineClient)
                .delete(eq(PURGE_PATH), eq("alice"));
        // Must not throw - the logout path depends on this swallowing failures so the user
        // can still log out when the engine is unreachable.
        service.purgeUserDocuments("alice");
        verify(aiEngineClient, times(1)).delete(eq(PURGE_PATH), eq("alice"));
    }

    @Test
    void swallowsWebApplicationExceptionFromEngine() throws IOException {
        doThrow(new WebApplicationException("engine returned 502", Response.Status.BAD_GATEWAY))
                .when(aiEngineClient)
                .delete(eq(PURGE_PATH), eq("alice"));
        service.purgeUserDocuments("alice");
        verify(aiEngineClient, times(1)).delete(eq(PURGE_PATH), eq("alice"));
    }
}
