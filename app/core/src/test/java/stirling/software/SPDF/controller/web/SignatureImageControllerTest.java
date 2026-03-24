package stirling.software.SPDF.controller.web;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import stirling.software.SPDF.service.SharedSignatureService;
import stirling.software.common.service.PersonalSignatureServiceInterface;
import stirling.software.common.service.UserServiceInterface;

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

    // --- PNG content type (default) ---

    @Test
    void getSignature_pngFile_returnsPngContentType() throws IOException {
        byte[] data = new byte[] {1, 2, 3};
        when(sharedSignatureService.getSharedSignatureBytes("sig.png")).thenReturn(data);

        SignatureImageController controller =
                new SignatureImageController(sharedSignatureService, null, null);

        ResponseEntity<byte[]> response = controller.getSignature("sig.png");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(MediaType.IMAGE_PNG, response.getHeaders().getContentType());
        assertArrayEquals(data, response.getBody());
    }

    // --- JPEG content type ---

    @Test
    void getSignature_jpgFile_returnsJpegContentType() throws IOException {
        byte[] data = new byte[] {4, 5, 6};
        when(sharedSignatureService.getSharedSignatureBytes("sig.jpg")).thenReturn(data);

        SignatureImageController controller =
                new SignatureImageController(sharedSignatureService, null, null);

        ResponseEntity<byte[]> response = controller.getSignature("sig.jpg");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(MediaType.IMAGE_JPEG, response.getHeaders().getContentType());
    }

    @Test
    void getSignature_jpegExtension_returnsJpegContentType() throws IOException {
        byte[] data = new byte[] {7, 8, 9};
        when(sharedSignatureService.getSharedSignatureBytes("sig.jpeg")).thenReturn(data);

        SignatureImageController controller =
                new SignatureImageController(sharedSignatureService, null, null);

        ResponseEntity<byte[]> response = controller.getSignature("sig.jpeg");

        assertEquals(MediaType.IMAGE_JPEG, response.getHeaders().getContentType());
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
                        sharedSignatureService, personalSignatureService, userService);

        ResponseEntity<byte[]> response = controller.getSignature("sig.png");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertArrayEquals(personalData, response.getBody());
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
                        sharedSignatureService, personalSignatureService, userService);

        ResponseEntity<byte[]> response = controller.getSignature("sig.png");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertArrayEquals(sharedData, response.getBody());
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
                        sharedSignatureService, personalSignatureService, userService);

        ResponseEntity<byte[]> response = controller.getSignature("sig.png");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertArrayEquals(sharedData, response.getBody());
    }

    // --- Not found in any location ---

    @Test
    void getSignature_notFoundAnywhere_returns404() throws IOException {
        when(sharedSignatureService.getSharedSignatureBytes("missing.png"))
                .thenThrow(new IOException("not found"));

        SignatureImageController controller =
                new SignatureImageController(sharedSignatureService, null, null);

        ResponseEntity<byte[]> response = controller.getSignature("missing.png");

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    // --- No personal service (community mode) ---

    @Test
    void getSignature_noPersonalService_usesSharedOnly() throws IOException {
        byte[] sharedData = new byte[] {40, 41};
        when(sharedSignatureService.getSharedSignatureBytes("sig.png")).thenReturn(sharedData);

        SignatureImageController controller =
                new SignatureImageController(sharedSignatureService, null, null);

        ResponseEntity<byte[]> response = controller.getSignature("sig.png");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertArrayEquals(sharedData, response.getBody());
    }

    // --- Case insensitive extension check ---

    @Test
    void getSignature_uppercaseJpg_returnsJpegContentType() throws IOException {
        byte[] data = new byte[] {50};
        when(sharedSignatureService.getSharedSignatureBytes("SIG.JPG")).thenReturn(data);

        SignatureImageController controller =
                new SignatureImageController(sharedSignatureService, null, null);

        ResponseEntity<byte[]> response = controller.getSignature("SIG.JPG");

        assertEquals(MediaType.IMAGE_JPEG, response.getHeaders().getContentType());
    }
}
