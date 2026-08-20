package stirling.software.SPDF.controller.web;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import jakarta.enterprise.inject.Instance;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import stirling.software.SPDF.service.SharedSignatureService;
import stirling.software.common.service.PersonalSignatureServiceInterface;
import stirling.software.common.service.UserServiceInterface;

/**
 * Unit tests for {@link SignatureImageController}.
 *
 * <p>Migrated off Spring: {@code getSignature} returns {@code jakarta.ws.rs.core.Response}
 * (asserted via {@code getStatus()}/{@code getEntity()}/{@code getMediaType()}), and the optional
 * personal signature and user services are injected as CDI {@code Instance<>} handles. A {@code
 * null} collaborator (community mode) is modelled as an unresolvable {@code Instance}.
 */
class SignatureImageControllerTest {

    private SharedSignatureService sharedSignatureService;
    private PersonalSignatureServiceInterface personalSignatureService;
    private UserServiceInterface userService;

    @BeforeEach
    void setUp() {
        sharedSignatureService = mock(SharedSignatureService.class);
        personalSignatureService = mock(PersonalSignatureServiceInterface.class);
        userService = mock(UserServiceInterface.class);
    }

    /**
     * Wrap a (possibly null) collaborator in a CDI {@link Instance} handle. A null service yields
     * an unresolvable handle, matching the controller's "optional bean absent" branch.
     */
    @SuppressWarnings("unchecked")
    private static <T> Instance<T> instanceOf(T service) {
        Instance<T> instance = mock(Instance.class);
        when(instance.isResolvable()).thenReturn(service != null);
        if (service != null) {
            when(instance.get()).thenReturn(service);
        }
        return instance;
    }

    // --- PNG content type (default) ---

    @Test
    void getSignature_pngFile_returnsPngContentType() throws IOException {
        byte[] data = new byte[] {1, 2, 3};
        when(sharedSignatureService.getSharedSignatureBytes("sig.png")).thenReturn(data);

        SignatureImageController controller =
                new SignatureImageController(
                        sharedSignatureService, instanceOf(null), instanceOf(null));

        Response response = controller.getSignature("sig.png");

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals(MediaType.valueOf("image/png"), response.getMediaType());
        assertArrayEquals(data, (byte[]) response.getEntity());
    }

    // --- JPEG content type ---

    @Test
    void getSignature_jpgFile_returnsJpegContentType() throws IOException {
        byte[] data = new byte[] {4, 5, 6};
        when(sharedSignatureService.getSharedSignatureBytes("sig.jpg")).thenReturn(data);

        SignatureImageController controller =
                new SignatureImageController(
                        sharedSignatureService, instanceOf(null), instanceOf(null));

        Response response = controller.getSignature("sig.jpg");

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals(MediaType.valueOf("image/jpeg"), response.getMediaType());
    }

    @Test
    void getSignature_jpegExtension_returnsJpegContentType() throws IOException {
        byte[] data = new byte[] {7, 8, 9};
        when(sharedSignatureService.getSharedSignatureBytes("sig.jpeg")).thenReturn(data);

        SignatureImageController controller =
                new SignatureImageController(
                        sharedSignatureService, instanceOf(null), instanceOf(null));

        Response response = controller.getSignature("sig.jpeg");

        assertEquals(MediaType.valueOf("image/jpeg"), response.getMediaType());
    }

    // --- Personal signature found ---

    @Test
    void getSignature_personalFound_returnsPersonalSignature() throws IOException {
        byte[] personalData = new byte[] {10, 11, 12};
        when(userService.getCurrentUsername()).thenReturn("testuser");
        when(personalSignatureService.getPersonalSignatureBytes("testuser", "sig.png"))
                .thenReturn(personalData);

        SignatureImageController controller =
                new SignatureImageController(
                        sharedSignatureService,
                        instanceOf(personalSignatureService),
                        instanceOf(userService));

        Response response = controller.getSignature("sig.png");

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertArrayEquals(personalData, (byte[]) response.getEntity());
        // Shared service should not be called since personal was found
        verify(sharedSignatureService, never()).getSharedSignatureBytes(anyString());
    }

    // --- Personal not found, falls back to shared ---

    @Test
    void getSignature_personalNotFound_fallsBackToShared() throws IOException {
        when(userService.getCurrentUsername()).thenReturn("testuser");
        when(personalSignatureService.getPersonalSignatureBytes("testuser", "sig.png"))
                .thenReturn(null);
        byte[] sharedData = new byte[] {20, 21, 22};
        when(sharedSignatureService.getSharedSignatureBytes("sig.png")).thenReturn(sharedData);

        SignatureImageController controller =
                new SignatureImageController(
                        sharedSignatureService,
                        instanceOf(personalSignatureService),
                        instanceOf(userService));

        Response response = controller.getSignature("sig.png");

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertArrayEquals(sharedData, (byte[]) response.getEntity());
    }

    // --- Personal throws exception, falls back to shared ---

    @Test
    void getSignature_personalThrows_fallsBackToShared() throws IOException {
        when(userService.getCurrentUsername()).thenReturn("testuser");
        when(personalSignatureService.getPersonalSignatureBytes("testuser", "sig.png"))
                .thenThrow(new RuntimeException("not found"));
        byte[] sharedData = new byte[] {30, 31};
        when(sharedSignatureService.getSharedSignatureBytes("sig.png")).thenReturn(sharedData);

        SignatureImageController controller =
                new SignatureImageController(
                        sharedSignatureService,
                        instanceOf(personalSignatureService),
                        instanceOf(userService));

        Response response = controller.getSignature("sig.png");

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertArrayEquals(sharedData, (byte[]) response.getEntity());
    }

    // --- Not found in any location ---

    @Test
    void getSignature_notFoundAnywhere_returns404() throws IOException {
        when(sharedSignatureService.getSharedSignatureBytes("missing.png"))
                .thenThrow(new IOException("not found"));

        SignatureImageController controller =
                new SignatureImageController(
                        sharedSignatureService, instanceOf(null), instanceOf(null));

        Response response = controller.getSignature("missing.png");

        assertEquals(Response.Status.NOT_FOUND.getStatusCode(), response.getStatus());
    }

    // --- No personal service (community mode) ---

    @Test
    void getSignature_noPersonalService_usesSharedOnly() throws IOException {
        byte[] sharedData = new byte[] {40, 41};
        when(sharedSignatureService.getSharedSignatureBytes("sig.png")).thenReturn(sharedData);

        SignatureImageController controller =
                new SignatureImageController(
                        sharedSignatureService, instanceOf(null), instanceOf(null));

        Response response = controller.getSignature("sig.png");

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertArrayEquals(sharedData, (byte[]) response.getEntity());
    }

    // --- Case insensitive extension check ---

    @Test
    void getSignature_uppercaseJpg_returnsJpegContentType() throws IOException {
        byte[] data = new byte[] {50};
        when(sharedSignatureService.getSharedSignatureBytes("SIG.JPG")).thenReturn(data);

        SignatureImageController controller =
                new SignatureImageController(
                        sharedSignatureService, instanceOf(null), instanceOf(null));

        Response response = controller.getSignature("SIG.JPG");

        assertEquals(MediaType.valueOf("image/jpeg"), response.getMediaType());
    }
}
