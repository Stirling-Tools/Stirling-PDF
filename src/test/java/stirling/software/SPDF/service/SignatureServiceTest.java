package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mockStatic;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.MockedStatic;

import stirling.software.SPDF.config.InstallationPathConfig;
import stirling.software.SPDF.model.SignatureFile;

class SignatureServiceTest {

    @TempDir Path tempDir;
    private SignatureService signatureService;
    private Path personalSignatureFolder;
    private Path sharedSignatureFolder;
    private final String ALL_USERS_FOLDER = "ALL_USERS";
    private final String TEST_USER = "testUser";

    @BeforeEach
    void setUp() throws IOException {
        // Set up our test directory structure
        personalSignatureFolder = tempDir.resolve(TEST_USER);
        sharedSignatureFolder = tempDir.resolve(ALL_USERS_FOLDER);

        Files.createDirectories(personalSignatureFolder);
        Files.createDirectories(sharedSignatureFolder);

        // Create test signature files
        Files.write(
                personalSignatureFolder.resolve("personal.png"),
                "personal signature content".getBytes());
        Files.write(
                sharedSignatureFolder.resolve("shared.jpg"), "shared signature content".getBytes());

        // Use try-with-resources for mockStatic
        try (MockedStatic<InstallationPathConfig> mockedConfig =
                mockStatic(InstallationPathConfig.class)) {
            mockedConfig
                    .when(InstallationPathConfig::getSignaturesPath)
                    .thenReturn(tempDir.toString());

            // Initialize the service with our temp directory
            signatureService = new SignatureService();
        }
    }

    @Test
    void testHasAccessToFile_PersonalFileExists() throws IOException {
        // Mock static method for each test
        try (MockedStatic<InstallationPathConfig> mockedConfig =
                mockStatic(InstallationPathConfig.class)) {
            mockedConfig
                    .when(InstallationPathConfig::getSignaturesPath)
                    .thenReturn(tempDir.toString());

            // Test
            boolean hasAccess = signatureService.hasAccessToFile(TEST_USER, "personal.png");

            // Verify
            assertTrue(hasAccess, "User should have access to their personal file");
        }
    }

    @Test
    void testHasAccessToFile_SharedFileExists() throws IOException {
        // Mock static method for each test
        try (MockedStatic<InstallationPathConfig> mockedConfig =
                mockStatic(InstallationPathConfig.class)) {
            mockedConfig
                    .when(InstallationPathConfig::getSignaturesPath)
                    .thenReturn(tempDir.toString());

            // Test
            boolean hasAccess = signatureService.hasAccessToFile(TEST_USER, "shared.jpg");

            // Verify
            assertTrue(hasAccess, "User should have access to shared files");
        }
    }

    @Test
    void testHasAccessToFile_FileDoesNotExist() throws IOException {
        // Mock static method for each test
        try (MockedStatic<InstallationPathConfig> mockedConfig =
                mockStatic(InstallationPathConfig.class)) {
            mockedConfig
                    .when(InstallationPathConfig::getSignaturesPath)
                    .thenReturn(tempDir.toString());

            // Test
            boolean hasAccess = signatureService.hasAccessToFile(TEST_USER, "nonexistent.png");

            // Verify
            assertFalse(hasAccess, "User should not have access to non-existent files");
        }
    }

    @Test
    void testHasAccessToFile_InvalidFileName() {
        // Mock static method for each test
        try (MockedStatic<InstallationPathConfig> mockedConfig =
                mockStatic(InstallationPathConfig.class)) {
            mockedConfig
                    .when(InstallationPathConfig::getSignaturesPath)
                    .thenReturn(tempDir.toString());

            // Test and verify
            assertThrows(
                    IllegalArgumentException.class,
                    () -> signatureService.hasAccessToFile(TEST_USER, "../invalid.png"),
                    "Should throw exception for file names with directory traversal");

            assertThrows(
                    IllegalArgumentException.class,
                    () -> signatureService.hasAccessToFile(TEST_USER, "invalid/file.png"),
                    "Should throw exception for file names with paths");
        }
    }

    @Test
    void testGetAvailableSignatures() {
        // Mock static method for each test
        try (MockedStatic<InstallationPathConfig> mockedConfig =
                mockStatic(InstallationPathConfig.class)) {
            mockedConfig
                    .when(InstallationPathConfig::getSignaturesPath)
                    .thenReturn(tempDir.toString());

            // Test
            List<SignatureFile> signatures = signatureService.getAvailableSignatures(TEST_USER);

            // Verify
            assertEquals(2, signatures.size(), "Should return both personal and shared signatures");

            // Check that we have one of each type
            boolean hasPersonal =
                    signatures.stream()
                            .anyMatch(
                                    sig ->
                                            "personal.png".equals(sig.getFileName())
                                                    && "Personal".equals(sig.getCategory()));
            boolean hasShared =
                    signatures.stream()
                            .anyMatch(
                                    sig ->
                                            "shared.jpg".equals(sig.getFileName())
                                                    && "Shared".equals(sig.getCategory()));

            assertTrue(hasPersonal, "Should include personal signature");
            assertTrue(hasShared, "Should include shared signature");
        }
    }

    @Test
    void testGetSignatureBytes_PersonalFile() throws IOException {
        // Mock static method for each test
        try (MockedStatic<InstallationPathConfig> mockedConfig =
                mockStatic(InstallationPathConfig.class)) {
            mockedConfig
                    .when(InstallationPathConfig::getSignaturesPath)
                    .thenReturn(tempDir.toString());

            // Test
            byte[] bytes = signatureService.getSignatureBytes(TEST_USER, "personal.png");

            // Verify
            assertEquals(
                    "personal signature content",
                    new String(bytes),
                    "Should return the correct content for personal file");
        }
    }

    @Test
    void testGetSignatureBytes_SharedFile() throws IOException {
        // Mock static method for each test
        try (MockedStatic<InstallationPathConfig> mockedConfig =
                mockStatic(InstallationPathConfig.class)) {
            mockedConfig
                    .when(InstallationPathConfig::getSignaturesPath)
                    .thenReturn(tempDir.toString());

            // Test
            byte[] bytes = signatureService.getSignatureBytes(TEST_USER, "shared.jpg");

            // Verify
            assertEquals(
                    "shared signature content",
                    new String(bytes),
                    "Should return the correct content for shared file");
        }
    }

    @Test
    void testGetSignatureBytes_FileNotFound() {
        // Mock static method for each test
        try (MockedStatic<InstallationPathConfig> mockedConfig =
                mockStatic(InstallationPathConfig.class)) {
            mockedConfig
                    .when(InstallationPathConfig::getSignaturesPath)
                    .thenReturn(tempDir.toString());

            // Test and verify
            assertThrows(
                    FileNotFoundException.class,
                    () -> signatureService.getSignatureBytes(TEST_USER, "nonexistent.png"),
                    "Should throw exception for non-existent files");
        }
    }

    @Test
    void testGetSignatureBytes_InvalidFileName() {
        // Mock static method for each test
        try (MockedStatic<InstallationPathConfig> mockedConfig =
                mockStatic(InstallationPathConfig.class)) {
            mockedConfig
                    .when(InstallationPathConfig::getSignaturesPath)
                    .thenReturn(tempDir.toString());

            // Test and verify
            assertThrows(
                    IllegalArgumentException.class,
                    () -> signatureService.getSignatureBytes(TEST_USER, "../invalid.png"),
                    "Should throw exception for file names with directory traversal");
        }
    }

    @Test
    void testGetAvailableSignatures_EmptyUsername() throws IOException {
        // Mock static method for each test
        try (MockedStatic<InstallationPathConfig> mockedConfig =
                mockStatic(InstallationPathConfig.class)) {
            mockedConfig
                    .when(InstallationPathConfig::getSignaturesPath)
                    .thenReturn(tempDir.toString());

            // Test
            List<SignatureFile> signatures = signatureService.getAvailableSignatures("");

            // Verify - should only have shared signatures
            assertEquals(
                    1,
                    signatures.size(),
                    "Should return only shared signatures for empty username");
            assertEquals(
                    "shared.jpg",
                    signatures.get(0).getFileName(),
                    "Should have the shared signature");
            assertEquals(
                    "Shared", signatures.get(0).getCategory(), "Should be categorized as shared");
        }
    }

    @Test
    void testGetAvailableSignatures_NonExistentUser() throws IOException {
        // Mock static method for each test
        try (MockedStatic<InstallationPathConfig> mockedConfig =
                mockStatic(InstallationPathConfig.class)) {
            mockedConfig
                    .when(InstallationPathConfig::getSignaturesPath)
                    .thenReturn(tempDir.toString());

            // Test
            List<SignatureFile> signatures =
                    signatureService.getAvailableSignatures("nonExistentUser");

            // Verify - should only have shared signatures
            assertEquals(
                    1,
                    signatures.size(),
                    "Should return only shared signatures for non-existent user");
            assertEquals(
                    "shared.jpg",
                    signatures.get(0).getFileName(),
                    "Should have the shared signature");
            assertEquals(
                    "Shared", signatures.get(0).getCategory(), "Should be categorized as shared");
        }
    }
}
