package stirling.software.proprietary.workflow.notification;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Supplier;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

import jakarta.mail.MessagingException;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.EmailService;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.model.WorkflowType;
import stirling.software.proprietary.workflow.notification.SigningEmailTemplates.Email;
import stirling.software.proprietary.workflow.notification.SigningEmailTemplates.Summary;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;
import stirling.software.proprietary.workflow.repository.WorkflowSessionRepository;

/**
 * Emails signing participants and the requester: an invitation when a participant is added, a
 * progress update to the requester on each signature or decline, and a completion notice to
 * participants when the requester finalizes. Nobody is emailed about their own action.
 *
 * <p>Runs after the publishing transaction commits, so a rolled-back action sends nothing, and
 * reloads the session in a read-only transaction of its own because open-in-view is off and the
 * publisher's entities are detached by then. Every failure is logged and swallowed: without a
 * surrounding transaction the listener runs inside {@code publishEvent}, and a saved signature must
 * not come back as an error because the mail server is down.
 */
@Slf4j
@Component
@ConditionalOnProperty(value = "mail.enabled", havingValue = "true")
public class SigningNotificationListener {

    // Must match the frontend routes: getToolUrlPath("sharedSign") and the token-gated participant
    // route in proprietary/App.tsx.
    static final String SHARED_SIGNING_PATH = "/shared-sign";
    static final String GUEST_SIGNING_PATH = "/workflow/sign/";

    // Same shape FileStorageService accepts for email shares; rejects usernames such as "admin".
    private static final Pattern EMAIL_ADDRESS =
            Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$");

    private final EmailService emailService;
    private final ApplicationProperties applicationProperties;
    private final WorkflowSessionRepository workflowSessionRepository;
    private final WorkflowParticipantRepository workflowParticipantRepository;
    private final TransactionTemplate readOnlyTransaction;

    public SigningNotificationListener(
            EmailService emailService,
            ApplicationProperties applicationProperties,
            WorkflowSessionRepository workflowSessionRepository,
            WorkflowParticipantRepository workflowParticipantRepository,
            PlatformTransactionManager transactionManager) {
        this.emailService = emailService;
        this.applicationProperties = applicationProperties;
        this.workflowSessionRepository = workflowSessionRepository;
        this.workflowParticipantRepository = workflowParticipantRepository;
        // REQUIRES_NEW: after commit the publisher's transaction is still bound to the thread, and
        // REQUIRED would join that finished transaction instead of starting one.
        this.readOnlyTransaction = new TransactionTemplate(transactionManager);
        this.readOnlyTransaction.setPropagationBehavior(
                TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.readOnlyTransaction.setReadOnly(true);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onInvitation(SigningInvitationEvent event) {
        deliver("invitation", () -> invitations(event));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onResponse(SigningResponseEvent event) {
        deliver("response", () -> response(event));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onCompletion(SigningCompletionEvent event) {
        deliver("completion", () -> completions(event));
    }

    private void deliver(String kind, Supplier<List<Email>> compose) {
        List<Email> emails;
        try {
            emails =
                    Objects.requireNonNullElse(
                            readOnlyTransaction.execute(status -> compose.get()), List.of());
        } catch (RuntimeException e) {
            log.warn("Could not prepare signing {} emails", kind, e);
            return;
        }
        for (Email email : emails) {
            try {
                emailService.sendBrandedEmail(email.to(), email.subject(), email.html());
            } catch (MessagingException | RuntimeException e) {
                log.warn("Could not send a signing {} email", kind, e);
            }
        }
    }

    private List<Email> invitations(SigningInvitationEvent event) {
        WorkflowSession session = signingSession(event.sessionId());
        if (session == null || !session.isActive()) {
            return List.of();
        }
        Summary summary = summarize(session);
        List<Email> emails = new ArrayList<>();
        for (WorkflowParticipant participant : session.getParticipants()) {
            if (!event.participantIds().contains(participant.getId())
                    || isOwner(session, participant)) {
                continue;
            }
            Optional<String> to = participantAddress(participant);
            Optional<String> link = participantLink(participant);
            if (to.isEmpty() || missingGuestLink(participant, link)) {
                continue;
            }
            emails.add(
                    SigningEmailTemplates.invitation(
                            to.get(), summary, link.orElse(null), isGuest(participant)));
        }
        return emails;
    }

    private List<Email> response(SigningResponseEvent event) {
        WorkflowParticipant responder =
                workflowParticipantRepository.findById(event.participantId()).orElse(null);
        if (responder == null) {
            return List.of();
        }
        WorkflowSession session = responder.getWorkflowSession();
        ParticipantStatus status = responder.getStatus();
        // Inactive: a response that lands after finalization has nothing left to report, and
        // "ready to finalize" would mislead.
        if (session.getWorkflowType() != WorkflowType.SIGNING
                || !session.isActive()
                || isOwner(session, responder)
                || (status != ParticipantStatus.SIGNED && status != ParticipantStatus.DECLINED)) {
            return List.of();
        }
        Optional<String> to = ownerAddress(session);
        if (to.isEmpty()) {
            log.debug(
                    "No email address for the owner of signing session {}", session.getSessionId());
            return List.of();
        }
        return List.of(
                SigningEmailTemplates.response(
                        to.get(),
                        summarize(session),
                        displayName(responder),
                        status == ParticipantStatus.SIGNED,
                        event.declineReason(),
                        appLink().orElse(null)));
    }

    private List<Email> completions(SigningCompletionEvent event) {
        WorkflowSession session = signingSession(event.sessionId());
        if (session == null) {
            return List.of();
        }
        Summary summary = summarize(session);
        List<Email> emails = new ArrayList<>();
        for (WorkflowParticipant participant : session.getParticipants()) {
            if (isOwner(session, participant)) {
                continue;
            }
            Optional<String> to = participantAddress(participant);
            Optional<String> link = participantLink(participant);
            if (to.isEmpty() || missingGuestLink(participant, link)) {
                continue;
            }
            emails.add(
                    SigningEmailTemplates.completion(
                            to.get(),
                            summary,
                            participant.getStatus(),
                            link.orElse(null),
                            isGuest(participant)));
        }
        return emails;
    }

    private WorkflowSession signingSession(String sessionId) {
        return workflowSessionRepository
                .findBySessionIdWithParticipants(sessionId)
                .filter(session -> session.getWorkflowType() == WorkflowType.SIGNING)
                .orElse(null);
    }

    private static Summary summarize(WorkflowSession session) {
        int signed = 0;
        int declined = 0;
        List<String> awaiting = new ArrayList<>();
        for (WorkflowParticipant participant : session.getParticipants()) {
            switch (participant.getStatus()) {
                case SIGNED -> signed++;
                case DECLINED -> declined++;
                default -> {
                    if (!participant.isExpired()) {
                        awaiting.add(displayName(participant));
                    }
                }
            }
        }
        return new Summary(
                session.getDocumentName(),
                session.getOwner().getUsername(),
                session.getMessage(),
                session.getDueDate(),
                session.getParticipants().size(),
                signed,
                declined,
                awaiting);
    }

    /** A guest has no account to sign in to, so an email without its token link is useless. */
    private static boolean missingGuestLink(
            WorkflowParticipant participant, Optional<String> link) {
        if (!isGuest(participant) || link.isPresent()) {
            return false;
        }
        log.warn(
                "Skipped a signing email to a guest participant: set system.frontendUrl so it can"
                        + " link to the signing page");
        return true;
    }

    private static boolean isGuest(WorkflowParticipant participant) {
        return participant.getUser() == null;
    }

    private static boolean isOwner(WorkflowSession session, WorkflowParticipant participant) {
        return participant.getUser() != null && participant.getUser().equals(session.getOwner());
    }

    private static String displayName(WorkflowParticipant participant) {
        if (hasText(participant.getName())) {
            return participant.getName().strip();
        }
        return hasText(participant.getEmail()) ? participant.getEmail().strip() : "A participant";
    }

    private static Optional<String> participantAddress(WorkflowParticipant participant) {
        User user = participant.getUser();
        return user != null ? userAddress(user) : emailAddress(participant.getEmail());
    }

    /** An address the owner gave for this session wins over the account's own. */
    private static Optional<String> ownerAddress(WorkflowSession session) {
        return emailAddress(session.getOwnerEmail()).or(() -> userAddress(session.getOwner()));
    }

    /** Self-hosted accounts often have no email column set, but are named by their address. */
    private static Optional<String> userAddress(User user) {
        return emailAddress(user.getEmail()).or(() -> emailAddress(user.getUsername()));
    }

    private static Optional<String> emailAddress(String value) {
        if (value == null) {
            return Optional.empty();
        }
        String trimmed = value.strip();
        return EMAIL_ADDRESS.matcher(trimmed).matches() ? Optional.of(trimmed) : Optional.empty();
    }

    /** Guests follow their share token; account holders sign in, so no bearer link is mailed. */
    private Optional<String> participantLink(WorkflowParticipant participant) {
        return isGuest(participant)
                ? baseUrl().map(base -> base + GUEST_SIGNING_PATH + participant.getShareToken())
                : appLink();
    }

    private Optional<String> appLink() {
        return baseUrl().map(base -> base + SHARED_SIGNING_PATH);
    }

    /**
     * Configured URLs only: the request's Host header is caller-controlled, and guests reach these
     * paths without signing in, so it must not decide where a link in someone else's inbox goes.
     */
    private Optional<String> baseUrl() {
        var system = applicationProperties.getSystem();
        return Stream.of(system.getFrontendUrl(), system.getBackendUrl())
                .filter(SigningNotificationListener::hasText)
                .map(url -> url.strip().replaceAll("/+$", ""))
                .findFirst();
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
