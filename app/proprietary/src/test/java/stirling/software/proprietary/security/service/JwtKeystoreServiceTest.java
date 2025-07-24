package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.JwtSigningKeyRepository;
import stirling.software.proprietary.security.model.JwtSigningKey;

@ExtendWith(MockitoExtension.class)
class JwtKeystoreServiceTest {

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

    private JwtKeystoreServiceImpl keystoreService;
    private KeyPair testKeyPair;

    @BeforeEach
    void setUp() throws NoSuchAlgorithmException {
        // Generate test keypair
        KeyPairGenerator keyPairGenerator = KeyPairGenerator.getInstance("RSA");
        keyPairGenerator.initialize(2048);
        testKeyPair = keyPairGenerator.generateKeyPair();

        // Mock configuration
        when(applicationProperties.getSecurity()).thenReturn(security);
        when(security.getJwt()).thenReturn(jwtConfig);
        when(jwtConfig.isEnableKeystore()).thenReturn(true);
    }

    @Test
    void testIsKeystoreEnabled() {
        when(jwtConfig.isEnableKeystore()).thenReturn(true);
        
        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());
            keystoreService = new JwtKeystoreServiceImpl(repository, applicationProperties);
            
            assertTrue(keystoreService.isKeystoreEnabled());
        }
    }

    @Test
    void testIsKeystoreDisabled() {
        when(jwtConfig.isEnableKeystore()).thenReturn(false);
        
        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());
            keystoreService = new JwtKeystoreServiceImpl(repository, applicationProperties);
            
            assertFalse(keystoreService.isKeystoreEnabled());
        }
    }

    @Test
    void testGetActiveKeypairWhenKeystoreDisabled() {
        when(jwtConfig.isEnableKeystore()).thenReturn(false);
        
        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());
            keystoreService = new JwtKeystoreServiceImpl(repository, applicationProperties);
            
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
            keystoreService = new JwtKeystoreServiceImpl(repository, applicationProperties);
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
        
        // Create private key file
        Path keyFile = tempDir.resolve("jwt-keys").resolve(keyId + ".key");
        Files.createDirectories(keyFile.getParent());
        Files.writeString(keyFile, privateKeyBase64);
        
        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());
            keystoreService = new JwtKeystoreServiceImpl(repository, applicationProperties);
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
        
        // Create private key file
        Path keyFile = tempDir.resolve("jwt-keys").resolve(keyId + ".key");
        Files.createDirectories(keyFile.getParent());
        Files.writeString(keyFile, privateKeyBase64);
        
        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());
            keystoreService = new JwtKeystoreServiceImpl(repository, applicationProperties);
            
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
            keystoreService = new JwtKeystoreServiceImpl(repository, applicationProperties);
            
            Optional<KeyPair> result = keystoreService.getKeypairByKeyId(keyId);
            
            assertFalse(result.isPresent());
        }
    }

    @Test
    void testGetKeypairByKeyIdWhenKeystoreDisabled() {
        when(jwtConfig.isEnableKeystore()).thenReturn(false);
        
        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());
            keystoreService = new JwtKeystoreServiceImpl(repository, applicationProperties);
            
            Optional<KeyPair> result = keystoreService.getKeypairByKeyId("any-key");
            
            assertFalse(result.isPresent());
        }
    }

    @Test
    void testRotateKeypair() throws Exception {
        String oldKeyId = "old-key-123";
        JwtSigningKey oldKey = new JwtSigningKey(oldKeyId, "old-public-key", "RS256");
        when(repository.findByIsActiveTrue()).thenReturn(Optional.of(oldKey));
        
        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());
            keystoreService = new JwtKeystoreServiceImpl(repository, applicationProperties);
            
            // Initialize first to create directory structure
            keystoreService.initializeKeystore();
            
            keystoreService.rotateKeypair();
            
            // Verify old key was deactivated
            assertFalse(oldKey.getIsActive());
            verify(repository, atLeast(2)).save(any(JwtSigningKey.class)); // At least one for deactivation, one for new key
            
            // Verify new key is active
            assertNotNull(keystoreService.getActiveKeyId());
            assertNotEquals(oldKeyId, keystoreService.getActiveKeyId());
        }
    }

    @Test
    void testRotateKeypairWhenKeystoreDisabled() {
        when(jwtConfig.isEnableKeystore()).thenReturn(false);
        
        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());
            keystoreService = new JwtKeystoreServiceImpl(repository, applicationProperties);
            
            // Should not throw exception, just log warning
            assertDoesNotThrow(() -> keystoreService.rotateKeypair());
            
            // Verify no database operations
            verify(repository, never()).save(any());
        }
    }

    @Test
    void testInitializeKeystoreCreatesDirectory() throws IOException {
        when(repository.findByIsActiveTrue()).thenReturn(Optional.empty());
        
        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());
            keystoreService = new JwtKeystoreServiceImpl(repository, applicationProperties);
            keystoreService.initializeKeystore();
            
            Path jwtKeysDir = tempDir.resolve("jwt-keys");
            assertTrue(Files.exists(jwtKeysDir));
            assertTrue(Files.isDirectory(jwtKeysDir));
        }
    }

    @Test
    void testLoadExistingKeypairWithMissingPrivateKeyFile() throws Exception {
        String keyId = "test-key-missing-file";
        String publicKeyBase64 = Base64.getEncoder().encodeToString(testKeyPair.getPublic().getEncoded());
        
        JwtSigningKey existingKey = new JwtSigningKey(keyId, publicKeyBase64, "RS256");
        when(repository.findByIsActiveTrue()).thenReturn(Optional.of(existingKey));
        
        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());
            keystoreService = new JwtKeystoreServiceImpl(repository, applicationProperties);
            keystoreService.initializeKeystore();
            
            // Should generate new keypair when private key file is missing
            KeyPair result = keystoreService.getActiveKeypair();
            assertNotNull(result);
            
            // Verify new keypair was generated and saved
            verify(repository).save(any(JwtSigningKey.class));
        }
    }

}