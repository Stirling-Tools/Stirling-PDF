package stirling.software.proprietary.storage.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import jakarta.persistence.EntityManager;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.provider.StoredObject;
import stirling.software.proprietary.storage.repository.*;

/** Real transactions must serialize two requests based on the same revision. */
@DataJpaTest(
        showSql = false,
        properties = "spring.datasource.url=jdbc:h2:mem:storage-revision;DB_CLOSE_DELAY=-1")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class FileStorageRevisionConcurrencyTest {
    @Autowired private EntityManager entityManager;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private StoredFileRepository files;

    @Test
    void overlappingUpdatesRejectTheSecondBeforeWritingItsBlob() throws Exception {
        var transactions = new TransactionTemplate(transactionManager);
        var owner = new User();
        owner.setUsername("revision-" + UUID.randomUUID());
        var original = new StoredFile();
        original.setOwner(owner);
        original.setStorageKey("original-key");
        original.setOriginalFilename("test.pdf");
        original.setContentType("application/pdf");
        original.setSizeBytes(1L);
        transactions.executeWithoutResult(
                status -> {
                    entityManager.persist(owner);
                    entityManager.persist(original);
                });
        var properties = new ApplicationProperties();
        properties.getSecurity().setEnableLogin(true);
        properties.getStorage().setEnabled(true);
        var storage = mock(StorageProvider.class);
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        when(storage.store(any(), any()))
                .thenAnswer(
                        invocation -> {
                            entered.countDown();
                            if (!release.await(5, TimeUnit.SECONDS))
                                throw new IllegalStateException("Writer not released");
                            return StoredObject.builder()
                                    .storageKey("replacement-key")
                                    .originalFilename("test.pdf")
                                    .contentType("application/pdf")
                                    .sizeBytes(1L)
                                    .build();
                        });
        var service =
                new FileStorageService(
                        files,
                        mock(FolderRepository.class),
                        mock(FileShareRepository.class),
                        mock(FileShareAccessRepository.class),
                        mock(UserRepository.class),
                        properties,
                        storage,
                        Optional.empty(),
                        mock(StorageCleanupEntryRepository.class));
        var upload = new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1});
        String revision = FileStorageService.revisionOf(original);
        var secondStarted = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var first =
                    executor.submit(
                            () ->
                                    transactions.execute(
                                            status ->
                                                    service.updateFileResponse(
                                                            owner,
                                                            original.getId(),
                                                            upload,
                                                            null,
                                                            null,
                                                            revision)));
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            var second =
                    executor.submit(
                            () -> {
                                secondStarted.countDown();
                                return transactions.execute(
                                        status ->
                                                service.updateFileResponse(
                                                        owner,
                                                        original.getId(),
                                                        upload,
                                                        null,
                                                        null,
                                                        revision));
                            });
            try {
                assertThat(secondStarted.await(5, TimeUnit.SECONDS)).isTrue();
                assertThatThrownBy(() -> second.get(150, TimeUnit.MILLISECONDS))
                        .isInstanceOf(TimeoutException.class);
            } finally {
                release.countDown();
            }
            assertThat(first.get(5, TimeUnit.SECONDS).getRevision()).isNotEqualTo(revision);
            assertThatThrownBy(() -> second.get(5, TimeUnit.SECONDS))
                    .satisfies(
                            error -> {
                                assertThat(error.getCause())
                                        .isInstanceOf(ResponseStatusException.class);
                                assertThat(
                                                ((ResponseStatusException) error.getCause())
                                                        .getStatusCode()
                                                        .value())
                                        .isEqualTo(409);
                            });
            verify(storage, times(1)).store(any(), any());
        } finally {
            release.countDown();
        }
    }

    @SpringBootConfiguration
    @EntityScan("stirling.software.proprietary")
    @EnableJpaRepositories(basePackageClasses = StoredFileRepository.class)
    static class TestApp {}
}
