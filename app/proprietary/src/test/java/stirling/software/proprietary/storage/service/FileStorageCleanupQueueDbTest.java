package stirling.software.proprietary.storage.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import jakarta.persistence.EntityManager;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.repository.FileShareAccessRepository;
import stirling.software.proprietary.storage.repository.FileShareRepository;
import stirling.software.proprietary.storage.repository.StorageCleanupEntryRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;

// The retry queue is written from afterCommit, where the caller's transaction has already
// committed; every other test mocks the repository, so only a real datasource proves the row lands.
@DataJpaTest
@Import(FileStorageCleanupQueueDbTest.Beans.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@DirtiesContext
class FileStorageCleanupQueueDbTest {

    @Autowired private FileStorageService fileStorageService;
    @Autowired private StorageCleanupQueue storageCleanupQueue;
    @Autowired private StorageCleanupEntryRepository cleanupEntryRepository;
    @Autowired private StoredFileRepository storedFileRepository;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private EntityManager entityManager;

    @Test
    void failedBlobDeleteAfterCommitLeavesACleanupEntryBehind() {
        String storageKey = "key-" + UUID.randomUUID();
        StoredFile file = persistFile(storageKey);

        fileStorageService.deleteFile(file.getOwner(), file);

        assertThat(storedFileRepository.findById(file.getId())).isEmpty();
        assertThat(cleanupEntryRepository.findAll())
                .extracting(entry -> entry.getStorageKey())
                .contains(storageKey);
    }

    @Test
    void everyFailedKeyOfADeletedFileIsQueued() {
        String mainKey = "main-" + UUID.randomUUID();
        String historyKey = "history-" + UUID.randomUUID();
        String auditKey = "audit-" + UUID.randomUUID();
        StoredFile file =
                inTransaction(
                        () -> {
                            StoredFile stored = newFile(mainKey);
                            stored.setHistoryStorageKey(historyKey);
                            stored.setAuditLogStorageKey(auditKey);
                            entityManager.persist(stored);
                            return stored;
                        });

        fileStorageService.deleteFile(file.getOwner(), file);

        assertThat(cleanupEntryRepository.findAll())
                .extracting(entry -> entry.getStorageKey())
                .contains(mainKey, historyKey, auditKey);
    }

    @Test
    void enqueuedKeySurvivesARollbackOfTheCallingTransaction() {
        String storageKey = "rollback-" + UUID.randomUUID();

        new TransactionTemplate(transactionManager)
                .execute(
                        status -> {
                            storageCleanupQueue.enqueue(storageKey);
                            status.setRollbackOnly();
                            return null;
                        });

        assertThat(cleanupEntryRepository.findAll())
                .extracting(entry -> entry.getStorageKey())
                .contains(storageKey);
    }

    private StoredFile persistFile(String storageKey) {
        return inTransaction(
                () -> {
                    StoredFile stored = newFile(storageKey);
                    entityManager.persist(stored);
                    return stored;
                });
    }

    private StoredFile newFile(String storageKey) {
        Team team = new Team();
        team.setName("team-" + UUID.randomUUID());
        entityManager.persist(team);

        User owner = new User();
        owner.setUsername("owner-" + UUID.randomUUID());
        owner.setPassword("x");
        owner.setTeam(team);
        entityManager.persist(owner);

        StoredFile stored = new StoredFile();
        stored.setOwner(owner);
        stored.setOriginalFilename("doc.pdf");
        stored.setContentType("application/pdf");
        stored.setSizeBytes(1);
        stored.setStorageKey(storageKey);
        return stored;
    }

    private <T> T inTransaction(java.util.function.Supplier<T> work) {
        return new TransactionTemplate(transactionManager).execute(status -> work.get());
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Beans {

        @Bean
        StorageProvider failingStorageProvider() throws IOException {
            StorageProvider provider = mock(StorageProvider.class);
            doThrow(new IOException("delete failed")).when(provider).delete(anyString());
            return provider;
        }

        @Bean
        ApplicationProperties applicationProperties() {
            ApplicationProperties properties =
                    mock(ApplicationProperties.class, RETURNS_DEEP_STUBS);
            when(properties.getSecurity().isEnableLogin()).thenReturn(true);
            when(properties.getStorage().isEnabled()).thenReturn(true);
            return properties;
        }

        @Bean
        StorageCleanupQueue storageCleanupQueue(StorageCleanupEntryRepository repository) {
            return new StorageCleanupQueue(repository);
        }

        @Bean
        FileStorageService fileStorageService(
                StoredFileRepository storedFileRepository,
                FileShareRepository fileShareRepository,
                FileShareAccessRepository fileShareAccessRepository,
                UserRepository userRepository,
                ApplicationProperties applicationProperties,
                StorageProvider storageProvider,
                StorageCleanupQueue storageCleanupQueue) {
            return new FileStorageService(
                    storedFileRepository,
                    fileShareRepository,
                    fileShareAccessRepository,
                    userRepository,
                    applicationProperties,
                    storageProvider,
                    Optional.empty(),
                    storageCleanupQueue);
        }
    }

    @SpringBootConfiguration
    @AutoConfigurationPackage(basePackages = "stirling.software.proprietary")
    static class TestApp {}
}
