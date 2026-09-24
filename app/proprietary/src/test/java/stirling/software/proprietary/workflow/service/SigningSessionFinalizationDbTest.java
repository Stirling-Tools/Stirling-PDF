package stirling.software.proprietary.workflow.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import jakarta.persistence.EntityManager;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.LicenseServiceInterface;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.provider.StoredObject;
import stirling.software.proprietary.storage.repository.StoredFileRepository;
import stirling.software.proprietary.workflow.dto.SignDocumentRequest;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.model.WorkflowType;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;
import stirling.software.proprietary.workflow.repository.WorkflowSessionRepository;

import tools.jackson.databind.ObjectMapper;

/**
 * Exercises commit, rollback and concurrent requests using real session rows and Spring
 * transactions.
 */
@DataJpaTest(
        showSql = false,
        properties =
                "spring.datasource.url=jdbc:h2:mem:signing-finalization;MODE=PostgreSQL;DB_CLOSE_DELAY=-1")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class SigningSessionFinalizationDbTest {
    @Autowired private SigningSessionFinalizationService finalization;
    @Autowired private WorkflowSessionService workflows;
    @Autowired private WorkflowSessionRepository sessions;
    @Autowired private EntityManager entityManager;
    @Autowired private PlatformTransactionManager transactionManager;
    @MockitoBean private SigningFinalizationService signer;
    @MockitoBean private StorageProvider storage;
    @MockitoBean private UserRepository users;
    @MockitoBean private MetadataEncryptionService encryption;
    @MockitoBean private CertificateSubmissionValidator validator;
    @MockitoBean private LicenseServiceInterface license;

    @MockitoBean
    private stirling.software.common.service.CustomPDFDocumentFactory pdfDocumentFactory;

    private TransactionTemplate transactions;
    private User owner;
    private User pendingSigner;
    private String sessionId;
    private String outputKey;

    @BeforeEach
    void createSession() throws Exception {
        transactions = new TransactionTemplate(transactionManager);
        sessionId = UUID.randomUUID().toString();
        outputKey = "output-" + sessionId;
        transactions.executeWithoutResult(
                status -> {
                    owner = new User();
                    owner.setUsername("owner-" + sessionId);
                    entityManager.persist(owner);
                    pendingSigner = new User();
                    pendingSigner.setUsername("pending-" + sessionId);
                    entityManager.persist(pendingSigner);
                    StoredFile original = new StoredFile();
                    original.setOwner(owner);
                    original.setStorageKey("original-" + sessionId);
                    original.setOriginalFilename("agreement.pdf");
                    original.setContentType("application/pdf");
                    original.setSizeBytes(3L);
                    entityManager.persist(original);
                    WorkflowSession session = new WorkflowSession();
                    session.setSessionId(sessionId);
                    session.setOwner(owner);
                    session.setOriginalFile(original);
                    session.setWorkflowType(WorkflowType.SIGNING);
                    session.setDocumentName("agreement.pdf");
                    WorkflowParticipant signed = participant(owner, ParticipantStatus.SIGNED);
                    signed.setParticipantMetadata(
                            new HashMap<>(
                                    Map.of(
                                            "certificateSubmission",
                                            Map.of("certType", "P12", "password", "encrypted"))));
                    session.addParticipant(signed);
                    session.addParticipant(participant(pendingSigner, ParticipantStatus.PENDING));
                    entityManager.persist(session);
                });
        when(storage.load("original-" + sessionId))
                .thenReturn(new ByteArrayResource(new byte[] {1}));
        when(storage.store(any(), any()))
                .thenReturn(
                        StoredObject.builder()
                                .storageKey(outputKey)
                                .originalFilename("agreement_shared_signed.pdf")
                                .contentType("application/pdf")
                                .sizeBytes(2)
                                .build());
        when(signer.finalizeDocument(any(), any())).thenReturn(new byte[] {2, 3});
    }

    private WorkflowParticipant participant(User user, ParticipantStatus status) {
        WorkflowParticipant participant = new WorkflowParticipant();
        participant.setUser(user);
        participant.setStatus(status);
        participant.setAccessRole(ShareAccessRole.EDITOR);
        participant.setShareToken(UUID.randomUUID().toString());
        return participant;
    }

    @Test
    void cleanupFailureRollsBackPublicationAndDeletesOutputBlob() throws Exception {
        doThrow(new IllegalStateException("cleanup failed"))
                .when(signer)
                .clearSensitiveMetadata(any());
        assertThatThrownBy(() -> finalization.finalizeSession(sessionId, owner))
                .hasMessageContaining("cleanup failed");
        transactions.executeWithoutResult(
                status -> {
                    WorkflowSession session = sessions.findBySessionId(sessionId).orElseThrow();
                    assertThat(session.isFinalized()).isFalse();
                    assertThat(session.getProcessedFile()).isNull();
                    assertThat(session.getOriginalFile().getStorageKey())
                            .isEqualTo("original-" + sessionId);
                    assertThat(session.getParticipants().getFirst().getParticipantMetadata())
                            .containsKey("certificateSubmission");
                });
        verify(storage).delete(outputKey);
    }

    @Test
    void checkedStorageFailureLeavesSessionOpen() throws Exception {
        when(storage.store(any(), any())).thenThrow(new IOException("storage unavailable"));
        assertThatThrownBy(() -> finalization.finalizeSession(sessionId, owner))
                .isInstanceOf(IOException.class);
        assertThat(sessions.findBySessionId(sessionId).orElseThrow().isFinalized()).isFalse();
    }

    @Test
    void zeroSignaturesCannotBeFinalized() {
        transactions.executeWithoutResult(
                status ->
                        sessions.findBySessionId(sessionId)
                                .orElseThrow()
                                .getParticipants()
                                .forEach(p -> p.setStatus(ParticipantStatus.PENDING)));
        assertThatThrownBy(() -> finalization.finalizeSession(sessionId, owner))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void concurrentSignAndSecondFinalizationWaitThenRejectClosedSession() throws Exception {
        CountDownLatch signing = new CountDownLatch(1);
        CountDownLatch finish = new CountDownLatch(1);
        when(signer.finalizeDocument(any(), any()))
                .thenAnswer(
                        inv -> {
                            signing.countDown();
                            if (!finish.await(5, TimeUnit.SECONDS))
                                throw new IllegalStateException("test finalization timed out");
                            return new byte[] {2, 3};
                        });
        try (var executor = Executors.newFixedThreadPool(3)) {
            var first = executor.submit(() -> finalization.finalizeSession(sessionId, owner));
            assertThat(signing.await(5, TimeUnit.SECONDS)).isTrue();
            CountDownLatch submitted = new CountDownLatch(2);
            var lateSign =
                    executor.submit(
                            () -> {
                                submitted.countDown();
                                workflows.signDocument(
                                        sessionId, pendingSigner, new SignDocumentRequest());
                                return null;
                            });
            var second =
                    executor.submit(
                            () -> {
                                submitted.countDown();
                                return finalization.finalizeSession(sessionId, owner);
                            });
            try {
                assertThat(submitted.await(5, TimeUnit.SECONDS)).isTrue();
                assertThatThrownBy(() -> lateSign.get(150, TimeUnit.MILLISECONDS))
                        .isInstanceOf(TimeoutException.class);
                assertThatThrownBy(() -> second.get(150, TimeUnit.MILLISECONDS))
                        .isInstanceOf(TimeoutException.class);
            } finally {
                finish.countDown();
            }
            assertThat(first.get(5, TimeUnit.SECONDS).bytes()).containsExactly(2, 3);
            assertThatThrownBy(() -> lateSign.get(5, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(ResponseStatusException.class);
            assertThatThrownBy(() -> second.get(5, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(ResponseStatusException.class);
        } finally {
            finish.countDown();
        }
        transactions.executeWithoutResult(
                status -> {
                    WorkflowSession session = sessions.findBySessionId(sessionId).orElseThrow();
                    assertThat(session.isFinalized()).isTrue();
                    assertThat(session.getParticipants())
                            .filteredOn(p -> p.getUser().equals(pendingSigner))
                            .extracting(WorkflowParticipant::getStatus)
                            .containsExactly(ParticipantStatus.PENDING);
                });
    }

    @SpringBootConfiguration
    @EntityScan("stirling.software.proprietary")
    @EnableJpaRepositories(basePackageClasses = WorkflowParticipantRepository.class)
    @Import({WorkflowSessionService.class, SigningSessionFinalizationService.class})
    static class TestApp {
        @Bean
        StoredFileRepository storedFiles(EntityManager entityManager) {
            return new JpaRepositoryFactory(entityManager)
                    .getRepository(StoredFileRepository.class);
        }

        @Bean
        ApplicationProperties properties() {
            return new ApplicationProperties();
        }

        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper();
        }
    }
}
