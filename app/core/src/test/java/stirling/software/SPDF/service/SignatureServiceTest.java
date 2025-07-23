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
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.MockedStatic;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.SPDF.model.SignatureFile;

@DisplayName("SignatureService Tests")
class SignatureServiceTest {

    @TempDir Path tempDir;
    private SignatureService signatureService;
    private final String TEST_USER = "testUser";

    @BeforeEach
    void setUp() throws IOException {
        // Set up our test directory structure
        Path personalSignatureFolder = tempDir.resolve(TEST_USER);
        String ALL_USERS_FOLDER = "ALL_USERS";
        Path sharedSignatureFolder = tempDir.resolve(ALL_USERS_FOLDER);

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

    @Nested
    @DisplayName("Access Check Tests")
    class AccessCheckTests {

        @Test
        @DisplayName("Grants access to personal file when it exists")
        void testHasAccessToFile_PersonalFileExists() throws IOException {
            try (MockedStatic<InstallationPathConfig> mockedConfig =
                     mockStatic(InstallationPathConfig.class)) {
                mockedConfig
                    .when(InstallationPathConfig::getSignaturesPath)
                    .thenReturn(tempDir.toString());

                boolean hasAccess = signatureService.hasAccessToFile(TEST_USER, "personal.png");

                assertTrue(hasAccess, "User should have access to their personal file");
            }
        }

        @Test
        @DisplayName("Grants access to shared file when it exists")
        void testHasAccessToFile_SharedFileExists() throws IOException {
            try (MockedStatic<InstallationPathConfig> mockedConfig =
                     mockStatic(InstallationPathConfig.class)) {
                mockedConfig
                    .when(InstallationPathConfig::getSignaturesPath)
                    .thenReturn(tempDir.toString());

                boolean hasAccess = signatureService.hasAccessToFile(TEST_USER, "shared.jpg");

                assertTrue(hasAccess, "User should have access to shared files");
            }
        }

        @Test
        @DisplayName("Denies access to non-existent file")
        void testHasAccessToFile_FileDoesNotExist() throws IOException {
            try (MockedStatic<InstallationPathConfig> mockedConfig =
                     mockStatic(InstallationPathConfig.class)) {
                mockedConfig
                    .when(InstallationPathConfig::getSignaturesPath)
                    .thenReturn(tempDir.toString());

                boolean hasAccess = signatureService.hasAccessToFile(TEST_USER, "nonexistent.png");

                assertFalse(hasAccess, "User should not have access to non-existent files");
            }
        }

        @Test
        @DisplayName("Throws exception for invalid file name with directory traversal")
        void testHasAccessToFile_InvalidFileName() {
            try (MockedStatic<InstallationPathConfig> mockedConfig =
                     mockStatic(InstallationPathConfig.class)) {
                mockedConfig
                    .when(InstallationPathConfig::getSignaturesPath)
                    .thenReturn(tempDir.toString());

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
    }

    @Nested
    @DisplayName("Signature Retrieval Tests")
    class SignatureRetrievalTests {

        @Test
        @DisplayName("Retrieves available signatures for user including personal and shared")
        void testGetAvailableSignatures() {
            try (MockedStatic<InstallationPathConfig> mockedConfig =
                     mockStatic(InstallationPathConfig.class)) {
                mockedConfig
                    .when(InstallationPathConfig::getSignaturesPath)
                    .thenReturn(tempDir.toString());

                List<SignatureFile> signatures = signatureService.getAvailableSignatures(TEST_USER);

                assertEquals(2, signatures.size(), "Should return both personal and shared signatures");

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
        @DisplayName("Retrieves only shared signatures for empty username")
        void testGetAvailableSignatures_EmptyUsername() throws IOException {
            try (MockedStatic<InstallationPathConfig> mockedConfig =
                     mockStatic(InstallationPathConfig.class)) {
                mockedConfig
                    .when(InstallationPathConfig::getSignaturesPath)
                    .thenReturn(tempDir.toString());

                List<SignatureFile> signatures = signatureService.getAvailableSignatures("");

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
        @DisplayName("Retrieves only shared signatures for non-existent user")
        void testGetAvailableSignatures_NonExistentUser() throws IOException {
            try (MockedStatic<InstallationPathConfig> mockedConfig =
                     mockStatic(InstallationPathConfig.class)) {
                mockedConfig
                    .when(InstallationPathConfig::getSignaturesPath)
                    .thenReturn(tempDir.toString());

                List<SignatureFile> signatures =
                    signatureService.getAvailableSignatures("nonExistentUser");

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

    @Nested
    @DisplayName("Signature Content Retrieval Tests")
    class SignatureContentRetrievalTests {

        @Test
        @DisplayName("Retrieves content of personal signature file")
        void testGetSignatureBytes_PersonalFile() throws IOException {
            try (MockedStatic<InstallationPathConfig> mockedConfig =
                     mockStatic(InstallationPathConfig.class)) {
                mockedConfig
                    .when(InstallationPathConfig::getSignaturesPath)
                    .thenReturn(tempDir.toString());

                byte[] bytes = signatureService.getSignatureBytes(TEST_USER, "personal.png");

                assertEquals(
                    "personal signature content",
                    new String(bytes),
                    "Should return the correct content for personal file");
            }
        }

        @Test
        @DisplayName("Retrieves content of shared signature file")
        void testGetSignatureBytes_SharedFile() throws IOException {
            try (MockedStatic<InstallationPathConfig> mockedConfig =
                     mockStatic(InstallationPathConfig.class)) {
                mockedConfig
                    .when(InstallationPathConfig::getSignaturesPath)
                    .thenReturn(tempDir.toString());

                byte[] bytes = signatureService.getSignatureBytes(TEST_USER, "shared.jpg");

                assertEquals(
                    "shared signature content",
                    new String(bytes),
                    "Should return the correct content for shared file");
            }
        }

        @Test
        @DisplayName("Throws exception when retrieving non-existent file")
        void testGetSignatureBytes_FileNotFound() {
            try (MockedStatic<InstallationPathConfig> mockedConfig =
                     mockStatic(InstallationPathConfig.class)) {
                mockedConfig
                    .when(InstallationPathConfig::getSignaturesPath)
                    .thenReturn(tempDir.toString());

                assertThrows(
                    FileNotFoundException.class,
                    () -> signatureService.getSignatureBytes(TEST_USER, "nonexistent.png"),
                    "Should throw exception for non-existent files");
            }
        }

        @Test
        @DisplayName("Throws exception for invalid file name during content retrieval")
        void testGetSignatureBytes_InvalidFileName() {
            try (MockedStatic<InstallationPathConfig> mockedConfig =
                     mockStatic(InstallationPathConfig.class)) {
                mockedConfig
                    .when(InstallationPathConfig::getSignaturesPath)
                    .thenReturn(tempDir.toString());

                assertThrows(
                    IllegalArgumentException.class,
                    () -> signatureService.getSignatureBytes(TEST_USER, "../invalid.png"),
                    "Should throw exception for file names with directory traversal");
            }
        }
    }
}
