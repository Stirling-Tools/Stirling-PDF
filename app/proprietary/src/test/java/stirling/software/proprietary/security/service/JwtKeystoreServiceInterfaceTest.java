package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.JwtSigningKeyRepository;
import stirling.software.proprietary.security.model.JwtSigningKey;

@ExtendWith(MockitoExtension.class)
class JwtKeystoreServiceInterfaceTest {

    @Mock
    private JwtSigningKeyRepository repository;

    @Mock
    private ApplicationProperties applicationProperties;

    @Mock
    private ApplicationProperties.Security security;

    @Mock
    private ApplicationProperties.Security.Jwt jwtConfig;

    @TempDir
    Path tempDir;

    private JwtKeystoreService keystoreService;
    private KeyPair testKeyPair;

    @BeforeEach
    void setUp() throws NoSuchAlgorithmException {
        KeyPairGenerator keyPairGenerator = KeyPairGenerator.getInstance("RSA");
        keyPairGenerator.initialize(2048);
        testKeyPair = keyPairGenerator.generateKeyPair();

        when(applicationProperties.getSecurity()).thenReturn(security);
        when(security.getJwt()).thenReturn(jwtConfig);
        when(jwtConfig.isEnableKeystore()).thenReturn(true);
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void testKeystoreEnabled(boolean keystoreEnabled) {
        when(jwtConfig.isEnableKeystore()).thenReturn(keystoreEnabled);

        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());
            keystoreService = new JwtKeystoreService(repository, applicationProperties);

            assertEquals(keystoreEnabled, keystoreService.isKeystoreEnabled());
        }
    }

    @Test
    void testGetActiveKeypairWhenKeystoreDisabled() {
        when(jwtConfig.isEnableKeystore()).thenReturn(false);

        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());
            keystoreService = new JwtKeystoreService(repository, applicationProperties);

            KeyPair result = keystoreService.getActiveKeypair();

            assertNotNull(result);
            assertNotNull(result.getPublic());
            assertNotNull(result.getPrivate());
        }
    }

    @Test
    void testGetActiveKeypairWhenNoActiveKeyExists() {
        when(repository.findByIsActiveTrue()).thenReturn(Optional.empty());

        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());
            keystoreService = new JwtKeystoreService(repository, applicationProperties);
            keystoreService.initializeKeystore();

            KeyPair result = keystoreService.getActiveKeypair();

            assertNotNull(result);
            verify(repository).save(any(JwtSigningKey.class));
        }
    }

    @Test
    void testGetActiveKeypairWithExistingKey() throws Exception {
        String keyId = "test-key-2024-01-01-120000";
        String publicKeyBase64 = Base64.getEncoder().encodeToString(testKeyPair.getPublic().getEncoded());
        String privateKeyBase64 = Base64.getEncoder().encodeToString(testKeyPair.getPrivate().getEncoded());

        JwtSigningKey existingKey = new JwtSigningKey(keyId, publicKeyBase64, "RS256");
        when(repository.findByIsActiveTrue()).thenReturn(Optional.of(existingKey));

        Path keyFile = tempDir.resolve("jwt-keys").resolve(keyId + ".key");
        Files.createDirectories(keyFile.getParent());
        Files.writeString(keyFile, privateKeyBase64);

        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());
            keystoreService = new JwtKeystoreService(repository, applicationProperties);
            keystoreService.initializeKeystore();

            KeyPair result = keystoreService.getActiveKeypair();

            assertNotNull(result);
            assertEquals(keyId, keystoreService.getActiveKeyId());
        }
    }

    @Test
    void testGetKeypairByKeyId() throws Exception {
        String keyId = "test-key-123";
        String publicKeyBase64 = Base64.getEncoder().encodeToString(testKeyPair.getPublic().getEncoded());
        String privateKeyBase64 = Base64.getEncoder().encodeToString(testKeyPair.getPrivate().getEncoded());

        JwtSigningKey signingKey = new JwtSigningKey(keyId, publicKeyBase64, "RS256");
        when(repository.findByKeyId(keyId)).thenReturn(Optional.of(signingKey));

        Path keyFile = tempDir.resolve("jwt-keys").resolve(keyId + ".key");
        Files.createDirectories(keyFile.getParent());
        Files.writeString(keyFile, privateKeyBase64);

        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());
            keystoreService = new JwtKeystoreService(repository, applicationProperties);

            Optional<KeyPair> result = keystoreService.getKeypairByKeyId(keyId);

            assertTrue(result.isPresent());
            assertNotNull(result.get().getPublic());
            assertNotNull(result.get().getPrivate());
        }
    }

    @Test
    void testGetKeypairByKeyIdNotFound() {
        String keyId = "non-existent-key";
        when(repository.findByKeyId(keyId)).thenReturn(Optional.empty());

        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());
            keystoreService = new JwtKeystoreService(repository, applicationProperties);

            Optional<KeyPair> result = keystoreService.getKeypairByKeyId(keyId);

            assertFalse(result.isPresent());
        }
    }

    @Test
    void testGetKeypairByKeyIdWhenKeystoreDisabled() {
        when(jwtConfig.isEnableKeystore()).thenReturn(false);

        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());
            keystoreService = new JwtKeystoreService(repository, applicationProperties);

            Optional<KeyPair> result = keystoreService.getKeypairByKeyId("any-key");

            assertFalse(result.isPresent());
        }
    }

    @Test
    void testRotateKeypair() {
        String oldKeyId = "old-key-123";
        JwtSigningKey oldKey = new JwtSigningKey(oldKeyId, "old-public-key", "RS256");
        when(repository.findByIsActiveTrue()).thenReturn(Optional.of(oldKey));

        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());
            keystoreService = new JwtKeystoreService(repository, applicationProperties);

            keystoreService.initializeKeystore();

            keystoreService.rotateKeypair();

            assertFalse(oldKey.getIsActive());
            verify(repository, atLeast(2)).save(any(JwtSigningKey.class)); // At least one for deactivation, one for new key

            assertNotNull(keystoreService.getActiveKeyId());
            assertNotEquals(oldKeyId, keystoreService.getActiveKeyId());
        }
    }

    @Test
    void testRotateKeypairWhenKeystoreDisabled() {
        when(jwtConfig.isEnableKeystore()).thenReturn(false);

        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());
            keystoreService = new JwtKeystoreService(repository, applicationProperties);

            assertDoesNotThrow(() -> keystoreService.rotateKeypair());

            verify(repository, never()).save(any());
        }
    }

    @Test
    void testInitializeKeystoreCreatesDirectory() throws IOException {
        when(repository.findByIsActiveTrue()).thenReturn(Optional.empty());

        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());
            keystoreService = new JwtKeystoreService(repository, applicationProperties);
            keystoreService.initializeKeystore();

            Path jwtKeysDir = tempDir.resolve("jwt-keys");
            assertTrue(Files.exists(jwtKeysDir));
            assertTrue(Files.isDirectory(jwtKeysDir));
        }
    }

    @Test
    void testLoadExistingKeypairWithMissingPrivateKeyFile() {
        String keyId = "test-key-missing-file";
        String publicKeyBase64 = Base64.getEncoder().encodeToString(testKeyPair.getPublic().getEncoded());

        JwtSigningKey existingKey = new JwtSigningKey(keyId, publicKeyBase64, "RS256");
        when(repository.findByIsActiveTrue()).thenReturn(Optional.of(existingKey));

        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());
            keystoreService = new JwtKeystoreService(repository, applicationProperties);
            keystoreService.initializeKeystore();

            KeyPair result = keystoreService.getActiveKeypair();
            assertNotNull(result);

            verify(repository).save(any(JwtSigningKey.class));
        }
    }

}
