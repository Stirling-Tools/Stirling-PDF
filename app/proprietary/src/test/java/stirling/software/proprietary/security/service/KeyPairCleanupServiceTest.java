package stirling.software.proprietary.security.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.cluster.DistributedLock;
import stirling.software.common.cluster.DistributedLock.LockHandle;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.JwtVerificationKey;

/** Cluster safety: pruning JWT keys is single-writer, gated on the shared cleanup lock. */
@ExtendWith(MockitoExtension.class)
class KeyPairCleanupServiceTest {

    @Mock private KeyPersistenceService keyPersistenceService;
    @Mock private ApplicationProperties applicationProperties;
    @Mock private ApplicationProperties.Security security;
    @Mock private ApplicationProperties.Security.Jwt jwtProperties;
    @Mock private DistributedLock distributedLock;
    @Mock private LockHandle lockHandle;

    private KeyPairCleanupService cleanupService;

    @BeforeEach
    void setUp() {
        lenient().when(applicationProperties.getSecurity()).thenReturn(security);
        lenient().when(security.getJwt()).thenReturn(jwtProperties);
        lenient().when(jwtProperties.isEnableKeyCleanup()).thenReturn(true);
        lenient().when(keyPersistenceService.isKeystoreEnabled()).thenReturn(true);
        cleanupService =
                new KeyPairCleanupService(
                        keyPersistenceService, applicationProperties, distributedLock);
    }

    @Test
    void skipsPruningWhenAnotherNodeHoldsTheLock() {
        when(distributedLock.tryAcquire(any(), any())).thenReturn(Optional.empty());

        cleanupService.cleanup();

        // No node-local pruning happened; the lock holder owns this cycle.
        verify(keyPersistenceService, never()).getKeysEligibleForCleanup(any());
        verify(keyPersistenceService, never()).refreshActiveKeyPair();
    }

    @Test
    void prunesAndRotatesWhenLockAcquiredThenReleasesIt() {
        when(distributedLock.tryAcquire(any(), any())).thenReturn(Optional.of(lockHandle));
        when(keyPersistenceService.getKeysEligibleForCleanup(any()))
                .thenReturn(List.of(new JwtVerificationKey("old-key", "cHVi")));

        cleanupService.cleanup();

        verify(keyPersistenceService).removeKey("old-key");
        verify(keyPersistenceService).refreshActiveKeyPair();
        verify(lockHandle).close();
    }

    @Test
    void releasesTheLockEvenWhenNoKeysAreEligible() {
        when(distributedLock.tryAcquire(any(), any())).thenReturn(Optional.of(lockHandle));
        when(keyPersistenceService.getKeysEligibleForCleanup(any())).thenReturn(List.of());

        cleanupService.cleanup();

        verify(keyPersistenceService, never()).refreshActiveKeyPair();
        verify(lockHandle).close();
    }

    @Test
    void skipsPruningWhenTheLockBackendErrors() {
        // A Valkey blip at boot must not fail startup: tryAcquire throwing degrades to skip.
        when(distributedLock.tryAcquire(any(), any()))
                .thenThrow(new RuntimeException("valkey unreachable"));

        cleanupService.cleanup();

        verify(keyPersistenceService, never()).getKeysEligibleForCleanup(any());
        verify(keyPersistenceService, never()).refreshActiveKeyPair();
    }

    @Test
    void doesNothingWhenCleanupDisabled() {
        when(jwtProperties.isEnableKeyCleanup()).thenReturn(false);

        cleanupService.cleanup();

        verify(distributedLock, never()).tryAcquire(any(), any());
    }
}
