package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mockStatic;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.MockedStatic;

import stirling.software.SPDF.model.api.signature.SavedSignatureRequest;
import stirling.software.SPDF.model.api.signature.SavedSignatureResponse;
import stirling.software.common.configuration.InstallationPathConfig;

import tools.jackson.databind.json.JsonMapper;

class SharedSignatureServiceExtendedTest {

    @TempDir Path tempDir;
    private SharedSignatureService service;
    private static final String TEST_USER = "testuser";

    @BeforeEach
    void setUp() {
        try (MockedStatic<InstallationPathConfig> mocked =
                mockStatic(InstallationPathConfig.class)) {
            mocked.when(InstallationPathConfig::getSignaturesPath).thenReturn(tempDir.toString());
            service = new SharedSignatureService(JsonMapper.builder().build());
        }
    }

    @Test
    void saveSignature_personalScope_savesImageFile() throws IOException {
        SavedSignatureRequest request = new SavedSignatureRequest();
        request.setId("sig1");
        request.setLabel("My Signature");
        request.setType("canvas");
        request.setScope("personal");
        byte[] imageBytes = new byte[] {(byte) 0x89, 0x50, 0x4E, 0x47}; // fake PNG header
        String base64 = Base64.getEncoder().encodeToString(imageBytes);
        request.setDataUrl("data:image/png;base64," + base64);

        SavedSignatureResponse response = service.saveSignature(TEST_USER, request);

        assertEquals("sig1", response.getId());
        assertEquals("My Signature", response.getLabel());
        assertEquals("canvas", response.getType());
        assertEquals("personal", response.getScope());
        assertNotNull(response.getCreatedAt());
        assertEquals("/api/v1/general/signatures/sig1.png", response.getDataUrl());
        assertTrue(Files.exists(tempDir.resolve(TEST_USER).resolve("sig1.png")));
    }

    @Test
    void saveSignature_sharedScope_savesToAllUsersFolder() throws IOException {
        SavedSignatureRequest request = new SavedSignatureRequest();
        request.setId("shared_sig");
        request.setLabel("Shared");
        request.setType("image");
        request.setScope("shared");
        byte[] imageBytes = new byte[] {(byte) 0xFF, (byte) 0xD8};
        String base64 = Base64.getEncoder().encodeToString(imageBytes);
        request.setDataUrl("data:image/jpeg;base64," + base64);

        SavedSignatureResponse response = service.saveSignature(TEST_USER, request);

        assertEquals("shared", response.getScope());
        assertTrue(Files.exists(tempDir.resolve("ALL_USERS").resolve("shared_sig.jpeg")));
    }

    @Test
    void saveSignature_nullScope_defaultsToPersonal() throws IOException {
        SavedSignatureRequest request = new SavedSignatureRequest();
        request.setId("sig2");
        request.setLabel("Test");
        request.setType("canvas");
        request.setScope(null);
        byte[] imageBytes = new byte[] {1, 2, 3};
        request.setDataUrl(
                "data:image/png;base64," + Base64.getEncoder().encodeToString(imageBytes));

        SavedSignatureResponse response = service.saveSignature(TEST_USER, request);
        assertEquals("personal", response.getScope());
    }

    @Test
    void saveSignature_emptyScope_defaultsToPersonal() throws IOException {
        SavedSignatureRequest request = new SavedSignatureRequest();
        request.setId("sig3");
        request.setLabel("Test");
        request.setType("canvas");
        request.setScope("");
        byte[] imageBytes = new byte[] {1, 2, 3};
        request.setDataUrl(
                "data:image/png;base64," + Base64.getEncoder().encodeToString(imageBytes));

        SavedSignatureResponse response = service.saveSignature(TEST_USER, request);
        assertEquals("personal", response.getScope());
    }

    @Test
    void saveSignature_unsupportedExtension_throws() {
        SavedSignatureRequest request = new SavedSignatureRequest();
        request.setId("sig4");
        request.setLabel("Test");
        request.setType("canvas");
        byte[] imageBytes = new byte[] {1, 2, 3};
        request.setDataUrl(
                "data:image/gif;base64," + Base64.getEncoder().encodeToString(imageBytes));

        assertThrows(
                IllegalArgumentException.class, () -> service.saveSignature(TEST_USER, request));
    }

    @Test
    void saveSignature_invalidFilename_throws() {
        SavedSignatureRequest request = new SavedSignatureRequest();
        request.setId("../evil");
        request.setLabel("Test");
        request.setType("canvas");
        request.setDataUrl("data:image/png;base64,AAAA");

        assertThrows(
                IllegalArgumentException.class, () -> service.saveSignature(TEST_USER, request));
    }

    @Test
    void saveSignature_noDataUrl_returnsResponseWithoutFile() throws IOException {
        SavedSignatureRequest request = new SavedSignatureRequest();
        request.setId("sigNoData");
        request.setLabel("No Data");
        request.setType("text");
        request.setDataUrl(null);

        SavedSignatureResponse response = service.saveSignature(TEST_USER, request);
        assertEquals("sigNoData", response.getId());
        assertNull(response.getDataUrl());
    }

    @Test
    void getSavedSignatures_returnsPersonalAndShared() throws IOException {
        // Create personal signature file
        Path personalDir = tempDir.resolve(TEST_USER);
        Files.createDirectories(personalDir);
        Files.write(personalDir.resolve("mysig.png"), new byte[] {1, 2, 3});

        // Create shared signature file
        Path sharedDir = tempDir.resolve("ALL_USERS");
        Files.createDirectories(sharedDir);
        Files.write(sharedDir.resolve("company.jpg"), new byte[] {4, 5, 6});

        List<SavedSignatureResponse> sigs = service.getSavedSignatures(TEST_USER);
        assertEquals(2, sigs.size());

        boolean hasPersonal =
                sigs.stream()
                        .anyMatch(
                                s -> "personal".equals(s.getScope()) && "mysig".equals(s.getId()));
        boolean hasShared =
                sigs.stream()
                        .anyMatch(
                                s -> "shared".equals(s.getScope()) && "company".equals(s.getId()));
        assertTrue(hasPersonal);
        assertTrue(hasShared);
    }

    @Test
    void getSavedSignatures_noFolders_returnsEmpty() throws IOException {
        List<SavedSignatureResponse> sigs = service.getSavedSignatures("nobody");
        assertTrue(sigs.isEmpty());
    }

    @Test
    void deleteSignature_personalFile_deletesSuccessfully() throws IOException {
        Path personalDir = tempDir.resolve(TEST_USER);
        Files.createDirectories(personalDir);
        Files.write(personalDir.resolve("todelete.png"), new byte[] {1});

        assertDoesNotThrow(() -> service.deleteSignature(TEST_USER, "todelete"));
        assertFalse(Files.exists(personalDir.resolve("todelete.png")));
    }

    @Test
    void deleteSignature_sharedFile_deletesWhenNotInPersonal() throws IOException {
        Path sharedDir = tempDir.resolve("ALL_USERS");
        Files.createDirectories(sharedDir);
        Files.write(sharedDir.resolve("shared_del.jpg"), new byte[] {1});

        assertDoesNotThrow(() -> service.deleteSignature(TEST_USER, "shared_del"));
        assertFalse(Files.exists(sharedDir.resolve("shared_del.jpg")));
    }

    @Test
    void deleteSignature_notFound_throwsFileNotFoundException() {
        assertThrows(
                FileNotFoundException.class,
                () -> service.deleteSignature(TEST_USER, "nonexistent"));
    }

    @Test
    void deleteSignature_invalidId_throwsIllegalArgument() {
        assertThrows(
                IllegalArgumentException.class,
                () -> service.deleteSignature(TEST_USER, "../hack"));
    }

    @Test
    void validateFileName_withSlash_throws() {
        assertThrows(
                IllegalArgumentException.class,
                () -> service.hasAccessToFile(TEST_USER, "path/file.png"));
    }

    @Test
    void validateFileName_withBackslash_throws() {
        assertThrows(
                IllegalArgumentException.class,
                () -> service.hasAccessToFile(TEST_USER, "path\\file.png"));
    }

    @Test
    void validateFileName_withSpecialChars_throws() {
        assertThrows(
                IllegalArgumentException.class,
                () -> service.hasAccessToFile(TEST_USER, "file name.png"));
    }
}
