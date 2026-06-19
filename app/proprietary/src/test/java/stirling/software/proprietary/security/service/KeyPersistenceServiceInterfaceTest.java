package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.lang.reflect.Field;
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

import com.github.benmanes.caffeine.cache.Cache;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.JwtVerificationKey;

/**
 * MIGRATION (Spring -> Quarkus): {@code KeyPersistenceService} no longer takes a Spring {@code
 * CacheManager} (the {@code @Cacheable("verifyingKeys")} layer and {@code
 * ConcurrentMapCacheManager} are gone). The constructor takes only {@link ApplicationProperties};
 * the verifying-key cache is a directly-managed Caffeine {@code Cache} private field. The
 * key-present test seeds that internal cache by reflection, matching what {@code getKeyPair} reads
 * via {@code getIfPresent}.
 */
@ExtendWith(MockitoExtension.class)
class KeyPersistenceServiceInterfaceTest {

    @Mock private ApplicationProperties applicationProperties;

    @Mock private ApplicationProperties.Security security;

    @Mock private ApplicationProperties.Security.Jwt jwtConfig;

    @TempDir Path tempDir;

    private KeyPersistenceService keyPersistenceService;
    private KeyPair testKeyPair;

    @BeforeEach
    void setUp() throws NoSuchAlgorithmException {
        KeyPairGenerator keyPairGenerator = KeyPairGenerator.getInstance("RSA");
        keyPairGenerator.initialize(2048);
        testKeyPair = keyPairGenerator.generateKeyPair();

        lenient().when(applicationProperties.getSecurity()).thenReturn(security);
        lenient().when(security.getJwt()).thenReturn(jwtConfig);
        lenient().when(jwtConfig.isEnableKeystore()).thenReturn(true); // Default value
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void testKeystoreEnabled(boolean keystoreEnabled) {
        when(jwtConfig.isEnableKeystore()).thenReturn(keystoreEnabled);

        // isKeystoreEnabled() reads only the config flag; no private-key directory access, so
        // InstallationPathConfig is not stubbed here.
        keyPersistenceService = new KeyPersistenceService(applicationProperties);

        assertEquals(keystoreEnabled, keyPersistenceService.isKeystoreEnabled());
    }

    @Test
    void testGetActiveKeypairWhenNoActiveKeyExists() {
        try (MockedStatic<InstallationPathConfig> mockedStatic =
                mockStatic(InstallationPathConfig.class)) {
            mockedStatic
                    .when(InstallationPathConfig::getPrivateKeyPath)
                    .thenReturn(tempDir.toString());
            keyPersistenceService = new KeyPersistenceService(applicationProperties);
            keyPersistenceService.initializeKeystore();

            JwtVerificationKey result = keyPersistenceService.getActiveKey();

            assertNotNull(result);
            assertNotNull(result.getKeyId());
            assertNotNull(result.getVerifyingKey());
        }
    }

    @Test
    void testGetActiveKeyPairWithExistingKey() throws Exception {
        String keyId = "test-key-2024-01-01-120000";
        String privateKeyBase64 =
                Base64.getEncoder().encodeToString(testKeyPair.getPrivate().getEncoded());

        Path keyFile = tempDir.resolve(keyId + ".key");
        Files.writeString(keyFile, privateKeyBase64);

        try (MockedStatic<InstallationPathConfig> mockedStatic =
                mockStatic(InstallationPathConfig.class)) {
            mockedStatic
                    .when(InstallationPathConfig::getPrivateKeyPath)
                    .thenReturn(tempDir.toString());
            keyPersistenceService = new KeyPersistenceService(applicationProperties);
            keyPersistenceService.initializeKeystore();

            JwtVerificationKey result = keyPersistenceService.getActiveKey();

            assertNotNull(result);
            assertNotNull(result.getKeyId());
        }
    }

    @Test
    void testGetKeyPair() throws Exception {
        String keyId = "test-key-123";
        String publicKeyBase64 =
                Base64.getEncoder().encodeToString(testKeyPair.getPublic().getEncoded());
        String privateKeyBase64 =
                Base64.getEncoder().encodeToString(testKeyPair.getPrivate().getEncoded());

        JwtVerificationKey signingKey = new JwtVerificationKey(keyId, publicKeyBase64);

        Path keyFile = tempDir.resolve(keyId + ".key");
        Files.writeString(keyFile, privateKeyBase64);

        try (MockedStatic<InstallationPathConfig> mockedStatic =
                mockStatic(InstallationPathConfig.class)) {
            mockedStatic
                    .when(InstallationPathConfig::getPrivateKeyPath)
                    .thenReturn(tempDir.toString());
            keyPersistenceService = new KeyPersistenceService(applicationProperties);

            // Seed the directly-managed Caffeine cache (formerly the Spring "verifyingKeys" cache);
            // getKeyPair resolves the verifying key from it via getIfPresent.
            seedVerifyingKeyCache(keyPersistenceService, keyId, signingKey);

            Optional<KeyPair> result = keyPersistenceService.getKeyPair(keyId);

            assertTrue(result.isPresent());
            assertNotNull(result.get().getPublic());
            assertNotNull(result.get().getPrivate());
        }
    }

    @Test
    void testGetKeyPairNotFound() {
        // No key in the cache and no keystore read needed: getKeyPair short-circuits to empty
        // before
        // touching the private-key directory, so InstallationPathConfig is not stubbed here.
        keyPersistenceService = new KeyPersistenceService(applicationProperties);

        Optional<KeyPair> result = keyPersistenceService.getKeyPair("non-existent-key");

        assertFalse(result.isPresent());
    }

    @Test
    void testGetKeyPairWhenKeystoreDisabled() {
        when(jwtConfig.isEnableKeystore()).thenReturn(false);

        keyPersistenceService = new KeyPersistenceService(applicationProperties);

        Optional<KeyPair> result = keyPersistenceService.getKeyPair("any-key");

        assertFalse(result.isPresent());
    }

    @Test
    void testInitializeKeystoreCreatesDirectory() throws IOException {
        try (MockedStatic<InstallationPathConfig> mockedStatic =
                mockStatic(InstallationPathConfig.class)) {
            mockedStatic
                    .when(InstallationPathConfig::getPrivateKeyPath)
                    .thenReturn(tempDir.toString());
            keyPersistenceService = new KeyPersistenceService(applicationProperties);
            keyPersistenceService.initializeKeystore();

            assertTrue(Files.exists(tempDir));
            assertTrue(Files.isDirectory(tempDir));
        }
    }

    @Test
    void testLoadExistingKeypairWithMissingPrivateKeyFile() throws Exception {
        try (MockedStatic<InstallationPathConfig> mockedStatic =
                mockStatic(InstallationPathConfig.class)) {
            mockedStatic
                    .when(InstallationPathConfig::getPrivateKeyPath)
                    .thenReturn(tempDir.toString());
            keyPersistenceService = new KeyPersistenceService(applicationProperties);
            keyPersistenceService.initializeKeystore();

            JwtVerificationKey result = keyPersistenceService.getActiveKey();
            assertNotNull(result);
            assertNotNull(result.getKeyId());
            assertNotNull(result.getVerifyingKey());
        }
    }

    @SuppressWarnings("unchecked")
    private static void seedVerifyingKeyCache(
            KeyPersistenceService service, String keyId, JwtVerificationKey key) throws Exception {
        Field f = KeyPersistenceService.class.getDeclaredField("verifyingKeyCache");
        f.setAccessible(true);
        Cache<Object, Object> cache = (Cache<Object, Object>) f.get(service);
        cache.put(keyId, key);
    }
}
