package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.JwtSigningKeyRepository;
import stirling.software.proprietary.security.model.JwtSigningKey;

@ExtendWith(MockitoExtension.class)
class JwtKeyCleanupServiceTest {

    @Mock
    private JwtSigningKeyRepository signingKeyRepository;

    @Mock
    private JwtKeystoreService keystoreService;

    @Mock
    private ApplicationProperties applicationProperties;

    @Mock
    private ApplicationProperties.Security security;

    @Mock
    private ApplicationProperties.Security.Jwt jwtConfig;

    @TempDir
    private Path tempDir;

    private JwtKeyCleanupService cleanupService;

    @BeforeEach
    void setUp() {
        lenient().when(applicationProperties.getSecurity()).thenReturn(security);
        lenient().when(security.getJwt()).thenReturn(jwtConfig);

        lenient().when(jwtConfig.isEnableKeyCleanup()).thenReturn(true);
        lenient().when(jwtConfig.getKeyRetentionDays()).thenReturn(7);
        lenient().when(jwtConfig.getCleanupBatchSize()).thenReturn(100);
        lenient().when(keystoreService.isKeystoreEnabled()).thenReturn(true);

        cleanupService = new JwtKeyCleanupService(signingKeyRepository, keystoreService, applicationProperties);
    }


    @Test
    void testCleanupDisabled_ShouldSkip() {
        when(jwtConfig.isEnableKeyCleanup()).thenReturn(false);

        cleanupService.cleanup();

        verify(signingKeyRepository, never()).countKeysEligibleForCleanup(any(LocalDateTime.class));
        verify(signingKeyRepository, never()).findInactiveKeysOlderThan(any(LocalDateTime.class), any(Pageable.class));
    }

    @Test
    void testCleanup_WhenKeystoreDisabled_ShouldSkip() {
        when(keystoreService.isKeystoreEnabled()).thenReturn(false);

        cleanupService.cleanup();

        verify(signingKeyRepository, never()).countKeysEligibleForCleanup(any(LocalDateTime.class));
        verify(signingKeyRepository, never()).findInactiveKeysOlderThan(any(LocalDateTime.class), any(Pageable.class));
    }

    @Test
    void testCleanup_WhenNoKeysEligible_ShouldExitEarly() {
        when(signingKeyRepository.countKeysEligibleForCleanup(any(LocalDateTime.class))).thenReturn(0L);

        cleanupService.cleanup();

        verify(signingKeyRepository).countKeysEligibleForCleanup(any(LocalDateTime.class));
        verify(signingKeyRepository, never()).findInactiveKeysOlderThan(any(LocalDateTime.class), any(Pageable.class));
    }

    @Test
    void testCleanupSuccessfully() throws IOException {
        JwtSigningKey key1 = createTestKey("key-1", 1L);
        JwtSigningKey key2 = createTestKey("key-2", 2L);
        List<JwtSigningKey> keysToCleanup = Arrays.asList(key1, key2);

        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getPrivateKeyPath).thenReturn(tempDir.toString());
            
            createTestKeyFile("key-1");
            createTestKeyFile("key-2");

            when(signingKeyRepository.countKeysEligibleForCleanup(any(LocalDateTime.class))).thenReturn(2L);
            when(signingKeyRepository.findInactiveKeysOlderThan(any(LocalDateTime.class), any(Pageable.class)))
                    .thenReturn(keysToCleanup)
                    .thenReturn(Collections.emptyList());

            cleanupService.cleanup();

            verify(signingKeyRepository).countKeysEligibleForCleanup(any(LocalDateTime.class));
            verify(signingKeyRepository).findInactiveKeysOlderThan(any(LocalDateTime.class), any(Pageable.class));
            verify(signingKeyRepository).deleteAllByIdInBatch(Arrays.asList(1L, 2L));

            assertFalse(Files.exists(tempDir.resolve("key-1.key")));
            assertFalse(Files.exists(tempDir.resolve("key-2.key")));
        }
    }

    @Test
    void testCleanup_WithBatchProcessing_ShouldProcessMultipleBatches() throws IOException {
        when(jwtConfig.getCleanupBatchSize()).thenReturn(2);

        JwtSigningKey key1 = createTestKey("key-1", 1L);
        JwtSigningKey key2 = createTestKey("key-2", 2L);
        JwtSigningKey key3 = createTestKey("key-3", 3L);

        List<JwtSigningKey> firstBatch = Arrays.asList(key1, key2);
        List<JwtSigningKey> secondBatch = Arrays.asList(key3);

        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getPrivateKeyPath).thenReturn(tempDir.toString());
            
            createTestKeyFile("key-1");
            createTestKeyFile("key-2");
            createTestKeyFile("key-3");

            when(signingKeyRepository.countKeysEligibleForCleanup(any(LocalDateTime.class))).thenReturn(3L);
            when(signingKeyRepository.findInactiveKeysOlderThan(any(LocalDateTime.class), any(Pageable.class)))
                    .thenReturn(firstBatch)
                    .thenReturn(secondBatch)
                    .thenReturn(Collections.emptyList());

            cleanupService.cleanup();

            verify(signingKeyRepository, times(2)).deleteAllByIdInBatch(any());
            verify(signingKeyRepository).deleteAllByIdInBatch(Arrays.asList(1L, 2L));
            verify(signingKeyRepository).deleteAllByIdInBatch(Arrays.asList(3L));
        }
    }

    @Test
    void testCleanup() throws IOException {
        JwtSigningKey key1 = createTestKey("key-1", 1L);
        JwtSigningKey key2 = createTestKey("key-2", 2L);
        List<JwtSigningKey> keysToCleanup = Arrays.asList(key1, key2);

        try (MockedStatic<InstallationPathConfig> mockedStatic = mockStatic(InstallationPathConfig.class)) {
            mockedStatic.when(InstallationPathConfig::getPrivateKeyPath).thenReturn(tempDir.toString());
            
            createTestKeyFile("key-1");

            when(signingKeyRepository.countKeysEligibleForCleanup(any(LocalDateTime.class))).thenReturn(2L);
            when(signingKeyRepository.findInactiveKeysOlderThan(any(LocalDateTime.class), any(Pageable.class)))
                    .thenReturn(keysToCleanup)
                    .thenReturn(Collections.emptyList());

            cleanupService.cleanup();

            verify(signingKeyRepository).deleteAllByIdInBatch(Arrays.asList(1L, 2L));
            assertFalse(Files.exists(tempDir.resolve("key-1.key")));
        }
    }

    @Test
    void testGetKeysEligibleForCleanup() {
        when(signingKeyRepository.countKeysEligibleForCleanup(any(LocalDateTime.class))).thenReturn(5L);

        long result = cleanupService.getKeysEligibleForCleanup();

        assertEquals(5L, result);
        verify(signingKeyRepository).countKeysEligibleForCleanup(any(LocalDateTime.class));
    }

    @Test
    void shouldReturnZero_WhenCleanupDisabled() {
        when(jwtConfig.isEnableKeyCleanup()).thenReturn(false);

        long result = cleanupService.getKeysEligibleForCleanup();

        assertEquals(0L, result);
        verify(signingKeyRepository, never()).countKeysEligibleForCleanup(any(LocalDateTime.class));
    }

    @Test
    void shouldReturnZero_WhenKeystoreDisabled() {
        when(keystoreService.isKeystoreEnabled()).thenReturn(false);

        long result = cleanupService.getKeysEligibleForCleanup();

        assertEquals(0L, result);
        verify(signingKeyRepository, never()).countKeysEligibleForCleanup(any(LocalDateTime.class));
    }

    @Test
    void testCleanup_WithRetentionDaysConfiguration_ShouldUseCorrectCutoffDate() {
        when(jwtConfig.getKeyRetentionDays()).thenReturn(14);
        when(signingKeyRepository.countKeysEligibleForCleanup(any(LocalDateTime.class))).thenReturn(0L);

        cleanupService.cleanup();

        verify(signingKeyRepository).countKeysEligibleForCleanup(argThat((LocalDateTime cutoffDate) -> {
            LocalDateTime expectedCutoff = LocalDateTime.now().minusDays(14);
            return Math.abs(java.time.Duration.between(cutoffDate, expectedCutoff).toMinutes()) <= 1;
        }));
    }

    @Test
    void testCleanupPrivateKeyFile_WhenKeystoreDisabled_ShouldSkipFileRemove() throws IOException {
        when(keystoreService.isKeystoreEnabled()).thenReturn(false);

        cleanupService.cleanup();

        verify(signingKeyRepository, never()).countKeysEligibleForCleanup(any(LocalDateTime.class));
        verify(signingKeyRepository, never()).findInactiveKeysOlderThan(any(LocalDateTime.class), any(Pageable.class));
        verify(signingKeyRepository, never()).deleteAllByIdInBatch(any());
    }

    private JwtSigningKey createTestKey(String keyId, Long id) {
        JwtSigningKey key = new JwtSigningKey();
        key.setId(id);
        key.setKeyId(keyId);
        key.setSigningKey("test-public-key");
        key.setAlgorithm("RS256");
        key.setIsActive(false);
        key.setCreatedAt(LocalDateTime.now().minusDays(10));
        return key;
    }

    private void createTestKeyFile(String keyId) throws IOException {
        Path keyFile = tempDir.resolve(keyId + ".key");
        Files.writeString(keyFile, "test-private-key-content");
    }
}
