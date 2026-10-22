package stirling.software.proprietary.workflow.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.SimpleTransactionStatus;

import jakarta.mail.MessagingException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.EmailService;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.model.WorkflowStatus;
import stirling.software.proprietary.workflow.model.WorkflowType;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;
import stirling.software.proprietary.workflow.repository.WorkflowSessionRepository;

@ExtendWith(MockitoExtension.class)
class SigningNotificationListenerTest {

    private static final String BASE = "https://pdf.example.com";

    @Mock private EmailService emailService;
    @Mock private WorkflowSessionRepository sessionRepository;
    @Mock private WorkflowParticipantRepository participantRepository;
    @Mock private PlatformTransactionManager transactionManager;

    private final ApplicationProperties properties = new ApplicationProperties();
    private SigningNotificationListener listener;
    private User owner;
    private WorkflowSession session;

    private record Sent(String to, String subject, String html) {}

    @BeforeEach
    void setUp() {
        lenient()
                .when(transactionManager.getTransaction(any()))
                .thenReturn(new SimpleTransactionStatus());
        properties.getSystem().setFrontendUrl(BASE + "/");
        listener =
                new SigningNotificationListener(
                        emailService,
                        properties,
                        sessionRepository,
                        participantRepository,
                        transactionManager);
        owner = user(1L, "owner@example.com");
        session = new WorkflowSession();
        session.setSessionId("s1");
        session.setOwner(owner);
        session.setWorkflowType(WorkflowType.SIGNING);
        session.setDocumentName("Contract.pdf");
        session.setStatus(WorkflowStatus.IN_PROGRESS);
    }

    private static User user(long id, String username) {
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        return user;
    }

    private WorkflowParticipant participant(
            long id, User account, String email, ParticipantStatus status) {
        WorkflowParticipant participant = new WorkflowParticipant();
        participant.setId(id);
        participant.setUser(account);
        participant.setEmail(email);
        participant.setName(account != null ? account.getUsername() : email);
        participant.setStatus(status);
        participant.setShareToken("token-" + id);
        participant.setAccessRole(ShareAccessRole.EDITOR);
        session.addParticipant(participant);
        return participant;
    }

    private void sessionIsStored() {
        when(sessionRepository.findBySessionIdWithParticipants("s1"))
                .thenReturn(Optional.of(session));
    }

    private void participantIsStored(WorkflowParticipant participant) {
        when(participantRepository.findById(participant.getId()))
                .thenReturn(Optional.of(participant));
    }

    private List<Sent> sent() throws MessagingException {
        ArgumentCaptor<String> to = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> subject = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> html = ArgumentCaptor.forClass(String.class);
        verify(emailService, atLeast(0))
                .sendBrandedEmail(to.capture(), subject.capture(), html.capture());
        List<Sent> sent = new ArrayList<>();
        for (int i = 0; i < to.getAllValues().size(); i++) {
            sent.add(
                    new Sent(
                            to.getAllValues().get(i),
                            subject.getAllValues().get(i),
                            html.getAllValues().get(i)));
        }
        return sent;
    }

    @Nested
    class Invitation {

        @Test
        void accountHolderGetsALinkToSharedSigningRatherThanTheirToken() throws Exception {
            participant(
                    2L, user(2L, "bob@example.com"), "bob@example.com", ParticipantStatus.PENDING);
            sessionIsStored();

            listener.onInvitation(new SigningInvitationEvent("s1", List.of(2L)));

            List<Sent> sent = sent();
            assertThat(sent).extracting(Sent::to).containsExactly("bob@example.com");
            assertThat(sent.get(0).html())
                    .contains("href=\"" + BASE + "/shared-sign\"")
                    .doesNotContain("token-2");
        }

        @Test
        void guestGetsTheirTokenLink() throws Exception {
            participant(3L, null, "guest@example.com", ParticipantStatus.PENDING);
            sessionIsStored();

            listener.onInvitation(new SigningInvitationEvent("s1", List.of(3L)));

            List<Sent> sent = sent();
            assertThat(sent).extracting(Sent::to).containsExactly("guest@example.com");
            assertThat(sent.get(0).html()).contains(BASE + "/workflow/sign/token-3");
        }

        @Test
        void onlyTheParticipantsInTheEventAreInvited() throws Exception {
            participant(
                    2L, user(2L, "bob@example.com"), "bob@example.com", ParticipantStatus.PENDING);
            participant(3L, null, "earlier@example.com", ParticipantStatus.VIEWED);
            sessionIsStored();

            listener.onInvitation(new SigningInvitationEvent("s1", List.of(2L)));

            assertThat(sent()).extracting(Sent::to).containsExactly("bob@example.com");
        }

        @Test
        void ownerAddingThemselvesIsNotInvited() throws Exception {
            participant(2L, owner, "owner@example.com", ParticipantStatus.PENDING);
            sessionIsStored();

            listener.onInvitation(new SigningInvitationEvent("s1", List.of(2L)));

            verifyNoInteractions(emailService);
        }

        @Test
        void accountEmailWinsAndUsernamesThatAreNotAddressesAreSkipped() throws Exception {
            User bob = user(2L, "bob");
            bob.setEmail("bob@corp.example.com");
            participant(2L, bob, "bob", ParticipantStatus.PENDING);
            participant(3L, user(3L, "carol"), "carol", ParticipantStatus.PENDING);
            sessionIsStored();

            listener.onInvitation(new SigningInvitationEvent("s1", List.of(2L, 3L)));

            assertThat(sent()).extracting(Sent::to).containsExactly("bob@corp.example.com");
        }

        @Test
        void closedSessionsSendNothing() {
            participant(
                    2L, user(2L, "bob@example.com"), "bob@example.com", ParticipantStatus.PENDING);
            session.setFinalized(true);
            sessionIsStored();

            listener.onInvitation(new SigningInvitationEvent("s1", List.of(2L)));

            verifyNoInteractions(emailService);
        }

        @Test
        void expiredGuestIsNotInvited() throws Exception {
            participant(
                    2L, user(2L, "bob@example.com"), "bob@example.com", ParticipantStatus.PENDING);
            participant(3L, null, "guest@example.com", ParticipantStatus.PENDING)
                    .setExpiresAt(LocalDateTime.now().minusMinutes(1));
            sessionIsStored();

            listener.onInvitation(new SigningInvitationEvent("s1", List.of(2L, 3L)));

            assertThat(sent()).extracting(Sent::to).containsExactly("bob@example.com");
        }

        @Test
        void otherWorkflowTypesSendNothing() {
            participant(
                    2L, user(2L, "bob@example.com"), "bob@example.com", ParticipantStatus.PENDING);
            session.setWorkflowType(WorkflowType.REVIEW);
            sessionIsStored();

            listener.onInvitation(new SigningInvitationEvent("s1", List.of(2L)));

            verifyNoInteractions(emailService);
        }

        @Test
        void withoutAConfiguredUrlGuestsAreSkippedAndAccountHoldersGetNoLink() throws Exception {
            properties.getSystem().setFrontendUrl("");
            properties.getSystem().setBackendUrl(" ");
            participant(
                    2L, user(2L, "bob@example.com"), "bob@example.com", ParticipantStatus.PENDING);
            participant(3L, null, "guest@example.com", ParticipantStatus.PENDING);
            sessionIsStored();

            listener.onInvitation(new SigningInvitationEvent("s1", List.of(2L, 3L)));

            List<Sent> sent = sent();
            assertThat(sent).extracting(Sent::to).containsExactly("bob@example.com");
            assertThat(sent.get(0).html())
                    .doesNotContain("<a href")
                    .contains("open Shared Signing");
        }

        @Test
        void fallsBackToTheBackendUrl() throws Exception {
            properties.getSystem().setFrontendUrl(null);
            properties.getSystem().setBackendUrl("http://host:8080");
            participant(
                    2L, user(2L, "bob@example.com"), "bob@example.com", ParticipantStatus.PENDING);
            sessionIsStored();

            listener.onInvitation(new SigningInvitationEvent("s1", List.of(2L)));

            assertThat(sent().get(0).html()).contains("href=\"http://host:8080/shared-sign\"");
        }
    }

    @Nested
    class Response {

        @Test
        void ownerGetsTheProgressAfterASignature() throws Exception {
            WorkflowParticipant alice =
                    participant(
                            2L,
                            user(2L, "alice@example.com"),
                            "alice@example.com",
                            ParticipantStatus.SIGNED);
            participant(3L, null, "bob@example.com", ParticipantStatus.VIEWED);
            participantIsStored(alice);

            listener.onResponse(new SigningResponseEvent(2L, null));

            List<Sent> sent = sent();
            assertThat(sent).extracting(Sent::to).containsExactly("owner@example.com");
            assertThat(sent.get(0).subject())
                    .isEqualTo("alice@example.com signed \"Contract.pdf\"");
            assertThat(sent.get(0).html())
                    .contains("Signed: 1 of 2")
                    .contains("Awaiting: 1 (bob@example.com)")
                    .contains("href=\"" + BASE + "/shared-sign\"");
        }

        @Test
        void addressGivenForTheSessionWins() throws Exception {
            session.setOwnerEmail("requests@example.com");
            WorkflowParticipant alice =
                    participant(2L, null, "alice@example.com", ParticipantStatus.SIGNED);
            participantIsStored(alice);

            listener.onResponse(new SigningResponseEvent(2L, null));

            assertThat(sent()).extracting(Sent::to).containsExactly("requests@example.com");
        }

        @Test
        void declineCarriesTheReasonAndCountsTowardReadiness() throws Exception {
            participant(2L, null, "alice@example.com", ParticipantStatus.SIGNED);
            WorkflowParticipant bob =
                    participant(3L, null, "bob@example.com", ParticipantStatus.DECLINED);
            participantIsStored(bob);

            listener.onResponse(new SigningResponseEvent(3L, "Not my department"));

            Sent sent = sent().get(0);
            assertThat(sent.subject()).isEqualTo("\"Contract.pdf\" is ready to finalize");
            assertThat(sent.html())
                    .contains("bob@example.com declined to sign")
                    .contains("Not my department")
                    .contains("Declined: 1");
        }

        @Test
        void ownerIsNotEmailedAboutTheirOwnSignature() {
            WorkflowParticipant self =
                    participant(2L, owner, "owner@example.com", ParticipantStatus.SIGNED);
            participantIsStored(self);

            listener.onResponse(new SigningResponseEvent(2L, null));

            verifyNoInteractions(emailService);
        }

        @Test
        void participantWhoHasNotRespondedSendsNothing() {
            WorkflowParticipant pending =
                    participant(2L, null, "alice@example.com", ParticipantStatus.VIEWED);
            participantIsStored(pending);

            listener.onResponse(new SigningResponseEvent(2L, null));

            verifyNoInteractions(emailService);
        }

        @Test
        void ownerWithoutAnAddressIsSkipped() {
            session.setOwner(user(1L, "admin"));
            WorkflowParticipant alice =
                    participant(2L, null, "alice@example.com", ParticipantStatus.SIGNED);
            participantIsStored(alice);

            listener.onResponse(new SigningResponseEvent(2L, null));

            verifyNoInteractions(emailService);
        }

        @Test
        void removedParticipantSendsNothing() {
            when(participantRepository.findById(9L)).thenReturn(Optional.empty());

            listener.onResponse(new SigningResponseEvent(9L, null));

            verifyNoInteractions(emailService);
        }

        @Test
        void responseAfterFinalizationSendsNothing() {
            WorkflowParticipant late =
                    participant(2L, null, "alice@example.com", ParticipantStatus.SIGNED);
            session.setFinalized(true);
            session.setStatus(WorkflowStatus.COMPLETED);
            participantIsStored(late);

            listener.onResponse(new SigningResponseEvent(2L, null));

            verifyNoInteractions(emailService);
        }
    }

    @Nested
    class Completion {

        @Test
        void everyParticipantButTheOwnerHearsTheDocumentIsDone() throws Exception {
            participant(2L, owner, "owner@example.com", ParticipantStatus.SIGNED);
            participant(
                    3L,
                    user(3L, "alice@example.com"),
                    "alice@example.com",
                    ParticipantStatus.SIGNED);
            participant(4L, null, "guest@example.com", ParticipantStatus.VIEWED);
            session.setFinalized(true);
            session.setStatus(WorkflowStatus.COMPLETED);
            sessionIsStored();

            listener.onCompletion(new SigningCompletionEvent("s1"));

            List<Sent> sent = sent();
            assertThat(sent)
                    .extracting(Sent::to)
                    .containsExactly("alice@example.com", "guest@example.com");
            assertThat(sent.get(0).html())
                    .contains("Your signature is included.")
                    .contains("href=\"" + BASE + "/shared-sign\"");
            assertThat(sent.get(1).html())
                    .contains("The request closed before you signed")
                    .contains(BASE + "/workflow/sign/token-4")
                    .contains("do not forward this email");
            assertThat(sent.get(0).html()).doesNotContain("do not forward");
        }

        @Test
        void expiredGuestIsSkippedBecauseTheirTokenNoLongerOpens() throws Exception {
            User alice = user(3L, "alice@example.com");
            participant(3L, alice, "alice@example.com", ParticipantStatus.SIGNED)
                    .setExpiresAt(LocalDateTime.now().minusDays(1));
            participant(4L, null, "guest@example.com", ParticipantStatus.SIGNED)
                    .setExpiresAt(LocalDateTime.now().minusDays(1));
            session.setFinalized(true);
            session.setStatus(WorkflowStatus.COMPLETED);
            sessionIsStored();

            listener.onCompletion(new SigningCompletionEvent("s1"));

            assertThat(sent()).extracting(Sent::to).containsExactly("alice@example.com");
        }
    }

    @Nested
    class Resilience {

        @Test
        void failedLookupSendsNothingAndDoesNotReachTheCaller() {
            when(sessionRepository.findBySessionIdWithParticipants("s1"))
                    .thenThrow(new IllegalStateException("database down"));

            assertThatCode(() -> listener.onCompletion(new SigningCompletionEvent("s1")))
                    .doesNotThrowAnyException();
            verifyNoInteractions(emailService);
        }

        @Test
        void oneFailedSendDoesNotStopTheRest() throws Exception {
            participant(2L, null, "alice@example.com", ParticipantStatus.PENDING);
            participant(3L, null, "bob@example.com", ParticipantStatus.PENDING);
            sessionIsStored();
            lenient()
                    .doThrow(new MessagingException("rejected"))
                    .when(emailService)
                    .sendBrandedEmail(eq("alice@example.com"), anyString(), anyString());

            assertThatCode(
                            () ->
                                    listener.onInvitation(
                                            new SigningInvitationEvent("s1", List.of(2L, 3L))))
                    .doesNotThrowAnyException();

            verify(emailService).sendBrandedEmail(eq("bob@example.com"), anyString(), anyString());
        }

        @Test
        void readsInAReadOnlyTransactionOfItsOwn() {
            sessionIsStored();

            listener.onCompletion(new SigningCompletionEvent("s1"));

            verify(transactionManager)
                    .getTransaction(
                            argThat(
                                    definition ->
                                            definition.getPropagationBehavior()
                                                            == TransactionDefinition
                                                                    .PROPAGATION_REQUIRES_NEW
                                                    && definition.isReadOnly()));
        }
    }
}
