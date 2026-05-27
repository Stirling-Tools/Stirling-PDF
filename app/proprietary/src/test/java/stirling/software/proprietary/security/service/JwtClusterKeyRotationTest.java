package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.security.PublicKey;
import java.time.Duration;
import java.util.Base64;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cache.CacheManager;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;

import stirling.software.common.cluster.KeyValueCache;
import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.JwtVerificationKey;

/**
 * Contract test for cluster-wide JWT public-key resolution.
 *
 * <p>Setup mirrors a two-node cluster: node A generates a keypair, publishes its public key to the
 * shared {@link KeyValueCache}, node B has never seen that keyId locally but resolves it from the
 * cluster cache before falling back to refreshing its own active key.
 */
@ExtendWith(MockitoExtension.class)
class JwtClusterKeyRotationTest {

    @Mock private ApplicationProperties applicationProperties;
    @Mock private ApplicationProperties.Security security;
    @Mock private ApplicationProperties.Security.Jwt jwtConfig;

    @TempDir Path nodeATempDir;
    @TempDir Path nodeBTempDir;

    @BeforeEach
    void setUp() {
        lenient().when(applicationProperties.getSecurity()).thenReturn(security);
        lenient().when(security.getJwt()).thenReturn(jwtConfig);
        lenient().when(jwtConfig.isEnableKeystore()).thenReturn(true);
    }

    @Test
    void rotationOnNodeA_publishesPublicKeyToClusterCache() {
        KeyValueCache shared = mock(KeyValueCache.class);
        try (MockedStatic<InstallationPathConfig> path = mockStatic(InstallationPathConfig.class)) {
            path.when(InstallationPathConfig::getPrivateKeyPath)
                    .thenReturn(nodeATempDir.toString());

            CacheManager cm = new ConcurrentMapCacheManager("verifyingKeys");
            KeyPersistenceService nodeA =
                    new KeyPersistenceService(applicationProperties, cm, shared);
            nodeA.initializeKeystore(); // generates first keypair

            JwtVerificationKey rotated = nodeA.refreshActiveKeyPair();
            assertNotNull(rotated);
            verify(shared, times(2))
                    .put(
                            eq(KeyPersistenceService.JWT_PUBKEY_NAMESPACE),
                            anyString(),
                            anyString(),
                            any(Duration.class));
        }
    }

    @Test
    void nodeB_resolvesPeerSignedKey_viaClusterCache() throws NoSuchAlgorithmException {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        KeyPair nodeAPair = gen.generateKeyPair();
        String peerKeyId = "node-a-key-2026-01-01";
        String peerEncoded = Base64.getEncoder().encodeToString(nodeAPair.getPublic().getEncoded());

        KeyValueCache shared = mock(KeyValueCache.class);
        when(shared.get(KeyPersistenceService.JWT_PUBKEY_NAMESPACE, peerKeyId))
                .thenReturn(Optional.of(peerEncoded));

        try (MockedStatic<InstallationPathConfig> path = mockStatic(InstallationPathConfig.class)) {
            path.when(InstallationPathConfig::getPrivateKeyPath)
                    .thenReturn(nodeBTempDir.toString());

            CacheManager cm = new ConcurrentMapCacheManager("verifyingKeys");
            KeyPersistenceService nodeB =
                    new KeyPersistenceService(applicationProperties, cm, shared);
            nodeB.initializeKeystore();

            Optional<PublicKey> resolved = nodeB.resolvePublicKey(peerKeyId);
            assertTrue(resolved.isPresent(), "node B must resolve peer's keyId from cluster cache");
            assertEquals(nodeAPair.getPublic(), resolved.get());

            // Peer-fetched keys are not cached locally - each verification re-reads from the
            // cluster cache so the effective TTL stays aligned with the broadcast TTL.
            nodeB.resolvePublicKey(peerKeyId);
            verify(shared, times(2)).get(KeyPersistenceService.JWT_PUBKEY_NAMESPACE, peerKeyId);
        }
    }

    @Test
    void resolvePublicKey_returnsEmpty_whenKeyIdUnknown() {
        KeyValueCache shared = mock(KeyValueCache.class);
        when(shared.get(eq(KeyPersistenceService.JWT_PUBKEY_NAMESPACE), anyString()))
                .thenReturn(Optional.empty());

        try (MockedStatic<InstallationPathConfig> path = mockStatic(InstallationPathConfig.class)) {
            path.when(InstallationPathConfig::getPrivateKeyPath)
                    .thenReturn(nodeBTempDir.toString());

            CacheManager cm = new ConcurrentMapCacheManager("verifyingKeys");
            KeyPersistenceService node =
                    new KeyPersistenceService(applicationProperties, cm, shared);
            node.initializeKeystore();

            assertTrue(node.resolvePublicKey("nope-not-here").isEmpty());
        }
    }

    @Test
    void resolvePublicKey_worksWithoutClusterCache_singleInstanceMode() {
        try (MockedStatic<InstallationPathConfig> path = mockStatic(InstallationPathConfig.class)) {
            path.when(InstallationPathConfig::getPrivateKeyPath)
                    .thenReturn(nodeATempDir.toString());

            CacheManager cm = new ConcurrentMapCacheManager("verifyingKeys");
            // Null cluster cache = single-instance install. Must still resolve local keys.
            KeyPersistenceService node = new KeyPersistenceService(applicationProperties, cm, null);
            node.initializeKeystore();
            JwtVerificationKey active = node.getActiveKey();

            Optional<PublicKey> resolved = node.resolvePublicKey(active.getKeyId());
            assertTrue(resolved.isPresent(), "local keyId must resolve without cluster cache");
        }
    }

    @Test
    void publishFailure_isNotFatal_keyStillUsableLocally() {
        KeyValueCache flaky = mock(KeyValueCache.class);
        doThrow(new RuntimeException("simulated valkey blip"))
                .when(flaky)
                .put(anyString(), anyString(), anyString(), any(Duration.class));

        try (MockedStatic<InstallationPathConfig> path = mockStatic(InstallationPathConfig.class)) {
            path.when(InstallationPathConfig::getPrivateKeyPath)
                    .thenReturn(nodeATempDir.toString());

            CacheManager cm = new ConcurrentMapCacheManager("verifyingKeys");
            KeyPersistenceService node =
                    new KeyPersistenceService(applicationProperties, cm, flaky);
            node.initializeKeystore();
            // The broadcast throws, but the keypair MUST still be generated and active.
            assertNotNull(node.getActiveKey());
        }
    }

    @Test
    void resolvePublicKey_clusterCacheThrows_degradesToEmpty_doesNotPropagate() {
        // A Valkey blip on the resolve path used to bubble up through JwtService and surface as a
        // misleading "Claims are empty" log. The caller (JwtService) interprets Optional.empty()
        // as "unknown keyId" and falls back to its local rotation path, which is the right
        // behaviour during a cluster-cache outage.
        KeyValueCache flaky = mock(KeyValueCache.class);
        when(flaky.get(eq(KeyPersistenceService.JWT_PUBKEY_NAMESPACE), anyString()))
                .thenThrow(new RuntimeException("simulated valkey outage"));

        try (MockedStatic<InstallationPathConfig> path = mockStatic(InstallationPathConfig.class)) {
            path.when(InstallationPathConfig::getPrivateKeyPath)
                    .thenReturn(nodeBTempDir.toString());

            CacheManager cm = new ConcurrentMapCacheManager("verifyingKeys");
            KeyPersistenceService node =
                    new KeyPersistenceService(applicationProperties, cm, flaky);
            node.initializeKeystore();

            // Unknown keyId: local cache + disk miss, falls into the cluster cache, which throws.
            Optional<PublicKey> resolved = node.resolvePublicKey("peer-key-we-have-never-seen");
            assertTrue(resolved.isEmpty(), "valkey outage must degrade to Optional.empty()");
        }
    }

    @Test
    void removeKey_evictsBothLocalAndClusterCaches() {
        KeyValueCache shared = mock(KeyValueCache.class);
        try (MockedStatic<InstallationPathConfig> path = mockStatic(InstallationPathConfig.class)) {
            path.when(InstallationPathConfig::getPrivateKeyPath)
                    .thenReturn(nodeATempDir.toString());

            CacheManager cm = new ConcurrentMapCacheManager("verifyingKeys");
            KeyPersistenceService node =
                    new KeyPersistenceService(applicationProperties, cm, shared);
            node.initializeKeystore();
            JwtVerificationKey active = node.getActiveKey();

            node.removeKey(active.getKeyId());

            verify(shared).evict(KeyPersistenceService.JWT_PUBKEY_NAMESPACE, active.getKeyId());
        }
    }

    @Test
    void removeKey_clusterEvictFailure_isNotFatal() {
        KeyValueCache flaky = mock(KeyValueCache.class);
        doThrow(new RuntimeException("simulated valkey blip"))
                .when(flaky)
                .evict(anyString(), anyString());

        try (MockedStatic<InstallationPathConfig> path = mockStatic(InstallationPathConfig.class)) {
            path.when(InstallationPathConfig::getPrivateKeyPath)
                    .thenReturn(nodeATempDir.toString());

            CacheManager cm = new ConcurrentMapCacheManager("verifyingKeys");
            KeyPersistenceService node =
                    new KeyPersistenceService(applicationProperties, cm, flaky);
            node.initializeKeystore();
            JwtVerificationKey active = node.getActiveKey();

            // Must not throw.
            node.removeKey(active.getKeyId());
        }
    }

    @Test
    void localGetKeyPair_recoversFromClusterCacheMiss_withoutRotation() {
        KeyValueCache cluster = mock(KeyValueCache.class);

        try (MockedStatic<InstallationPathConfig> path = mockStatic(InstallationPathConfig.class)) {
            path.when(InstallationPathConfig::getPrivateKeyPath)
                    .thenReturn(nodeATempDir.toString());

            CacheManager cm = new ConcurrentMapCacheManager("verifyingKeys");
            KeyPersistenceService node =
                    new KeyPersistenceService(applicationProperties, cm, cluster);
            node.initializeKeystore();

            JwtVerificationKey active = node.getActiveKey();
            assertNotNull(active);

            assertTrue(node.getKeyPair(active.getKeyId()).isPresent());
            verify(cluster, never())
                    .get(eq(KeyPersistenceService.JWT_PUBKEY_NAMESPACE), anyString());
        }
    }
}
