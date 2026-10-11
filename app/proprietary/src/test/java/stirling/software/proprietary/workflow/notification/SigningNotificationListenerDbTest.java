package stirling.software.proprietary.workflow.notification;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.EmailService;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.repository.StoredFileRepository;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.model.WorkflowStatus;
import stirling.software.proprietary.workflow.model.WorkflowType;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;
import stirling.software.proprietary.workflow.repository.WorkflowSessionRepository;

/**
 * Drives the listener through real Spring transactions and Hibernate: mail goes out only after
 * commit, never after a rollback, and the session graph is reloaded rather than read from the
 * publisher's detached entities.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(SigningNotificationListener.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
// H2 has no jsonb type; the domain lets the workflow entities build their schema here.
@TestPropertySource(
        properties = {
            "spring.datasource.url=jdbc:h2:mem:signingnotify;DB_CLOSE_DELAY=-1;INIT=CREATE DOMAIN"
                    + " IF NOT EXISTS JSONB AS JSON",
            "spring.datasource.driver-class-name=org.h2.Driver",
            "spring.datasource.username=sa",
            "spring.datasource.password=",
            "mail.enabled=true"
        })
class SigningNotificationListenerDbTest {

    @Autowired private ApplicationEventPublisher publisher;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private EmailService emailService;
    @Autowired private UserRepository userRepository;
    @Autowired private StoredFileRepository storedFileRepository;
    @Autowired private WorkflowSessionRepository sessionRepository;
    @Autowired private WorkflowParticipantRepository participantRepository;

    @BeforeEach
    void clear() {
        reset(emailService);
        inTransaction(
                () -> {
                    sessionRepository.deleteAll();
                    storedFileRepository.deleteAll();
                    userRepository.deleteAll();
                });
    }

    @Test
    void ownerIsEmailedOnlyOnceTheSignatureCommits() throws Exception {
        Long signerId = seedSession().signerId();

        inTransaction(
                () -> {
                    markSigned(signerId);
                    publisher.publishEvent(new SigningResponseEvent(signerId, null));
                    verifyNoInteractions(emailService);
                });

        verify(emailService)
                .sendBrandedEmail(
                        eq("owner@example.com"),
                        eq("alice@example.com signed \"Contract.pdf\""),
                        contains("Signed: 1 of 2"));
    }

    @Test
    void rolledBackSignatureSendsNothing() {
        Long signerId = seedSession().signerId();

        new TransactionTemplate(transactionManager)
                .executeWithoutResult(
                        status -> {
                            markSigned(signerId);
                            publisher.publishEvent(new SigningResponseEvent(signerId, null));
                            status.setRollbackOnly();
                        });

        verifyNoInteractions(emailService);
    }

    @Test
    void publishedWithoutATransactionItLoadsTheSessionItself() throws Exception {
        Long signerId = seedSession().signerId();
        inTransaction(() -> markSigned(signerId));

        publisher.publishEvent(new SigningResponseEvent(signerId, null));

        verify(emailService)
                .sendBrandedEmail(
                        eq("owner@example.com"),
                        anyString(),
                        contains("Awaiting: 1 (guest@example.com)"));
    }

    @Test
    void completionReachesEachParticipantThroughTheirOwnLink() throws Exception {
        Seeded seeded = seedSession();
        inTransaction(
                () -> {
                    markSigned(seeded.signerId());
                    WorkflowSession session =
                            sessionRepository.findBySessionId(seeded.sessionId()).orElseThrow();
                    session.setFinalized(true);
                    session.setStatus(WorkflowStatus.COMPLETED);
                    sessionRepository.save(session);
                });

        publisher.publishEvent(new SigningCompletionEvent(seeded.sessionId()));

        verify(emailService)
                .sendBrandedEmail(
                        eq("alice@example.com"),
                        eq("\"Contract.pdf\" has been finalized"),
                        contains("https://pdf.example.com/shared-sign"));
        verify(emailService)
                .sendBrandedEmail(
                        eq("guest@example.com"),
                        anyString(),
                        contains("https://pdf.example.com/workflow/sign/" + seeded.guestToken()));
        verify(emailService, never())
                .sendBrandedEmail(eq("owner@example.com"), anyString(), anyString());
    }

    @Test
    void failingMailServerNeverFailsTheAction() throws Exception {
        Long signerId = seedSession().signerId();
        inTransaction(() -> markSigned(signerId));
        doThrow(new IllegalStateException("smtp down"))
                .when(emailService)
                .sendBrandedEmail(anyString(), anyString(), anyString());

        assertThatCode(() -> publisher.publishEvent(new SigningResponseEvent(signerId, null)))
                .doesNotThrowAnyException();
        assertThatCode(
                        () ->
                                inTransaction(
                                        () ->
                                                publisher.publishEvent(
                                                        new SigningResponseEvent(signerId, null))))
                .doesNotThrowAnyException();
    }

    private record Seeded(String sessionId, Long signerId, String guestToken) {}

    /** An owner, a signed-in participant (alice) and a guest, all still pending. */
    private Seeded seedSession() {
        return new TransactionTemplate(transactionManager)
                .execute(
                        status -> {
                            User owner = saveUser("owner@example.com");
                            StoredFile file = new StoredFile();
                            file.setOwner(owner);
                            file.setOriginalFilename("Contract.pdf");
                            file.setStorageKey("key-" + UUID.randomUUID());
                            storedFileRepository.save(file);

                            WorkflowSession session = new WorkflowSession();
                            session.setOwner(owner);
                            session.setWorkflowType(WorkflowType.SIGNING);
                            session.setDocumentName("Contract.pdf");
                            session.setOriginalFile(file);
                            WorkflowParticipant signer =
                                    participant(saveUser("alice@example.com"), "alice@example.com");
                            WorkflowParticipant guest = participant(null, "guest@example.com");
                            session.addParticipant(signer);
                            session.addParticipant(guest);
                            sessionRepository.save(session);
                            return new Seeded(
                                    session.getSessionId(), signer.getId(), guest.getShareToken());
                        });
    }

    private User saveUser(String username) {
        User user = new User();
        user.setUsername(username);
        user.setPassword("x");
        return userRepository.save(user);
    }

    private static WorkflowParticipant participant(User account, String email) {
        WorkflowParticipant participant = new WorkflowParticipant();
        participant.setUser(account);
        participant.setEmail(email);
        participant.setName(email);
        participant.setShareToken(UUID.randomUUID().toString());
        participant.setAccessRole(ShareAccessRole.EDITOR);
        return participant;
    }

    private void markSigned(Long participantId) {
        WorkflowParticipant participant =
                participantRepository.findById(participantId).orElseThrow();
        participant.setStatus(ParticipantStatus.SIGNED);
        participantRepository.save(participant);
    }

    private void inTransaction(Runnable work) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> work.run());
    }

    @SpringBootConfiguration
    @EntityScan(
            basePackages = {
                "stirling.software.proprietary.workflow.model",
                "stirling.software.proprietary.storage.model",
                "stirling.software.proprietary.security.model",
                "stirling.software.proprietary.model"
            })
    @EnableJpaRepositories(
            basePackages = {
                "stirling.software.proprietary.workflow.repository",
                "stirling.software.proprietary.storage.repository",
                "stirling.software.proprietary.security.database.repository"
            })
    static class TestApp {
        @Bean
        EmailService emailService() {
            return mock(EmailService.class);
        }

        @Bean
        ApplicationProperties applicationProperties() {
            ApplicationProperties properties = new ApplicationProperties();
            properties.getSystem().setFrontendUrl("https://pdf.example.com");
            return properties;
        }
    }
}
