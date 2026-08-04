package stirling.software.proprietary.security.database.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;
import jakarta.inject.Named;
import jakarta.mail.MessagingException;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Premium.EnterpriseFeatures.DatabaseNotifications;
import stirling.software.proprietary.security.database.DatabaseNotificationServiceInterface;
import stirling.software.proprietary.security.service.EmailService;

@ApplicationScoped
@Slf4j
public class DatabaseNotificationService implements DatabaseNotificationServiceInterface {

    private final Instance<EmailService> emailService;
    private final ApplicationProperties props;
    private final boolean runningEE;
    private DatabaseNotifications notifications;

    @Inject
    DatabaseNotificationService(
            Instance<EmailService> emailService,
            ApplicationProperties props,
            @Named("runningEE") boolean runningEE) {
        this.emailService = emailService;
        this.props = props;
        this.runningEE = runningEE;
        notifications = props.getPremium().getEnterpriseFeatures().getDatabaseNotifications();
    }

    @Override
    public void notifyBackupsSuccess(String subject, String message) {
        if (notifications.getBackups().isSuccessful() && runningEE) {
            sendMail(subject, message);
        }
    }

    @Override
    public void notifyBackupsFailure(String subject, String message) {
        if (notifications.getBackups().isFailed() && runningEE) {
            sendMail(subject, message);
        }
    }

    @Override
    public void notifyImportsSuccess(String subject, String message) {
        if (notifications.getImports().isSuccessful() && runningEE) {
            sendMail(subject, message);
        }
    }

    @Override
    public void notifyImportsFailure(String subject, String message) {
        if (notifications.getImports().isFailed() && runningEE) {
            sendMail(subject, message);
        }
    }

    private void sendMail(String subject, String message) {
        // MIGRATION: Spring Optional<EmailService> optional dependency -> CDI Instance<T>;
        // ifPresent -> isResolvable() guard + get().
        if (emailService.isResolvable()) {
            try {
                String to = props.getMail().getFrom();
                emailService.get().sendSimpleMail(to, subject, message);
            } catch (MessagingException e) {
                log.error("Error sending notification email: {}", e.getMessage(), e);
            }
        }
    }
}
