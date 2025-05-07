package stirling.software.SPDF.config.security.mail;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.api.Email;

/**
 * Service class responsible for sending emails, including those with attachments. It uses
 * JavaMailSender to send the email and is designed to handle both the message content and file
 * attachments.
 */
@Service
@RequiredArgsConstructor
@ConditionalOnProperty(value = "mail.enabled", havingValue = "true", matchIfMissing = false)
public class EmailService {

    private final JavaMailSender mailSender;
    private final ApplicationProperties applicationProperties;

    /**
     * Sends an email with an attachment asynchronously. This method is annotated with @Async, which
     * means it will be executed asynchronously.
     *
     * @param email The Email object containing the recipient, subject, body, and file attachment.
     * @throws MessagingException If there is an issue with creating or sending the email.
     */
    @Async
    public void sendEmailWithAttachment(Email email) throws MessagingException {
        ApplicationProperties.Mail mailProperties = applicationProperties.getMail();
        MultipartFile file = email.getFileInput();

        // Creates a MimeMessage to represent the email
        MimeMessage message = mailSender.createMimeMessage();

        // Helper class to set up the message content and attachments
        MimeMessageHelper helper = new MimeMessageHelper(message, true);

        // Sets the recipient, subject, body, and sender email
        helper.addTo(email.getTo());
        helper.setSubject(email.getSubject());
        helper.setText(
                email.getBody(),
                true); // The "true" here indicates that the body contains HTML content.
        helper.setFrom(mailProperties.getFrom());

        // Adds the attachment to the email
        helper.addAttachment(file.getOriginalFilename(), file);

        // Sends the email via the configured mail sender
        mailSender.send(message);
    }
}
