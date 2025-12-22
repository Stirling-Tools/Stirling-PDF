package stirling.software.proprietary.security.database.service;

import java.util.Optional;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import jakarta.mail.MessagingException;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Premium.EnterpriseFeatures.DatabaseNotifications;
import stirling.software.proprietary.security.database.DatabaseNotificationServiceInterface;
import stirling.software.proprietary.security.service.EmailService;

@Service
@Slf4j
public class DatabaseNotificationService implements DatabaseNotificationServiceInterface {

    private final Optional<EmailService> emailService;
    private final ApplicationProperties props;
    private final boolean runningEE;
    private DatabaseNotifications notifications;

    DatabaseNotificationService(
            Optional<EmailService> emailService,
            ApplicationProperties props,
            @Qualifier("runningEE") boolean runningEE) {
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
        emailService.ifPresent(
                service -> {
                    try {
                        String to = props.getMail().getFrom();
                        service.sendSimpleMail(to, subject, message);
                    } catch (MessagingException e) {
                        log.error("Error sending notification email: {}", e.getMessage(), e);
                    }
                });
    }
}
