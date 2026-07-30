package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cache.CacheManager;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.JwtSigningKeyEntity;
import stirling.software.proprietary.security.model.JwtVerificationKey;
import stirling.software.proprietary.security.repository.JwtSigningKeyRepository;

/** DB-backed keystore: a key present only in the shared DB still resolves (the cross-node case). */
@ExtendWith(MockitoExtension.class)
class KeyPersistenceServiceInterfaceTest {

    @Mock private ApplicationProperties applicationProperties;
    @Mock private ApplicationProperties.Security security;
    @Mock private ApplicationProperties.Security.Jwt jwtConfig;
    @Mock private JwtSigningKeyRepository keyRepository;

    private KeyPersistenceService keyPersistenceService;
    private KeyPair testKeyPair;
    private CacheManager cacheManager;

    @BeforeEach
    void setUp() throws NoSuchAlgorithmException {
        KeyPairGenerator keyPairGenerator = KeyPairGenerator.getInstance("RSA");
        keyPairGenerator.initialize(2048);
        testKeyPair = keyPairGenerator.generateKeyPair();

        cacheManager = new ConcurrentMapCacheManager("verifyingKeys");

        lenient().when(applicationProperties.getSecurity()).thenReturn(security);
        lenient().when(security.getJwt()).thenReturn(jwtConfig);
        lenient().when(jwtConfig.isEnableKeystore()).thenReturn(true);
        lenient().when(keyRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        // clusterEnabled=true so the convergence-reload path is exercised.
        keyPersistenceService =
                new KeyPersistenceService(applicationProperties, cacheManager, keyRepository, true);
    }

    private JwtSigningKeyEntity entityFrom(String keyId) {
        return new JwtSigningKeyEntity(
                keyId,
                Base64.getEncoder().encodeToString(testKeyPair.getPublic().getEncoded()),
                Base64.getEncoder().encodeToString(testKeyPair.getPrivate().getEncoded()));
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void testKeystoreEnabled(boolean keystoreEnabled) {
        when(jwtConfig.isEnableKeystore()).thenReturn(keystoreEnabled);
        assertEquals(keystoreEnabled, keyPersistenceService.isKeystoreEnabled());
    }

    @Test
    void generatesAndPersistsAKeyWhenNoneIsActive() {
        // getActiveKey with no active key mints one and persists it - no disk involved.
        JwtVerificationKey active = keyPersistenceService.getActiveKey();

        assertNotNull(active);
        assertNotNull(active.getKeyId());
        assertNotNull(active.getVerifyingKey());
        verify(keyRepository).save(any(JwtSigningKeyEntity.class));
    }

    @Test
    void loadsTheMostRecentExistingKeyAsActive() {
        when(keyRepository.count()).thenReturn(1L);
        when(keyRepository.findAllByOrderByCreatedAtDesc())
                .thenReturn(List.of(entityFrom("jwt-key-2026-07-13-000000-abcd1234")));

        keyPersistenceService.initializeKeystore();
        JwtVerificationKey active = keyPersistenceService.getActiveKey();

        assertEquals("jwt-key-2026-07-13-000000-abcd1234", active.getKeyId());
    }

    @Test
    void getKeyPairResolvesAKeyPresentOnlyInTheSharedDb() {
        // Never initialised locally: the key lives only in the DB, as if another node minted it.
        String keyId = "jwt-key-from-another-node";
        when(keyRepository.findById(keyId)).thenReturn(Optional.of(entityFrom(keyId)));

        Optional<KeyPair> result = keyPersistenceService.getKeyPair(keyId);

        assertTrue(result.isPresent());
        assertNotNull(result.get().getPublic());
        assertNotNull(result.get().getPrivate());
    }

    @Test
    void getKeyPairIsEmptyWhenTheKeyIsUnknown() {
        when(keyRepository.findById("nope")).thenReturn(Optional.empty());
        assertFalse(keyPersistenceService.getKeyPair("nope").isPresent());
    }

    @Test
    void getKeyPairIsEmptyWhenKeystoreDisabled() {
        when(jwtConfig.isEnableKeystore()).thenReturn(false);
        assertFalse(keyPersistenceService.getKeyPair("any-key").isPresent());
    }

    @Test
    void eligibleForCleanupIsSourcedFromTheDb() {
        when(keyRepository.findByCreatedAtBefore(any())).thenReturn(List.of(entityFrom("old-key")));

        List<JwtVerificationKey> stale =
                keyPersistenceService.getKeysEligibleForCleanup(java.time.LocalDateTime.now());

        assertEquals(1, stale.size());
        assertEquals("old-key", stale.get(0).getKeyId());
    }

    @Test
    void reloadAdoptsTheNewestKeyAPeerMinted() {
        // Boot with our own key active, then a peer mints a newer one in the shared DB.
        when(keyRepository.count()).thenReturn(1L);
        when(keyRepository.findAllByOrderByCreatedAtDesc())
                .thenReturn(List.of(entityFrom("jwt-key-local-old")));
        keyPersistenceService.initializeKeystore();
        assertEquals("jwt-key-local-old", keyPersistenceService.getActiveKey().getKeyId());

        when(keyRepository.findFirstByOrderByCreatedAtDesc())
                .thenReturn(Optional.of(entityFrom("jwt-key-peer-new")));

        keyPersistenceService.reloadActiveKeyFromDb();

        // Converged: this node now signs with the peer's newer key.
        assertEquals("jwt-key-peer-new", keyPersistenceService.getActiveKey().getKeyId());
    }

    @Test
    void reloadDoesNothingOffCluster() {
        KeyPersistenceService singleNode =
                new KeyPersistenceService(
                        applicationProperties, cacheManager, keyRepository, false);

        singleNode.reloadActiveKeyFromDb();

        // Off-cluster the DB is never consulted for convergence.
        verify(keyRepository, org.mockito.Mockito.never()).findFirstByOrderByCreatedAtDesc();
    }

    @Test
    void reloadIsANoOpWhenAlreadyHoldingTheNewestKey() {
        when(keyRepository.count()).thenReturn(1L);
        when(keyRepository.findAllByOrderByCreatedAtDesc())
                .thenReturn(List.of(entityFrom("jwt-key-current")));
        keyPersistenceService.initializeKeystore();

        when(keyRepository.findFirstByOrderByCreatedAtDesc())
                .thenReturn(Optional.of(entityFrom("jwt-key-current")));

        keyPersistenceService.reloadActiveKeyFromDb();

        assertEquals("jwt-key-current", keyPersistenceService.getActiveKey().getKeyId());
    }
}
