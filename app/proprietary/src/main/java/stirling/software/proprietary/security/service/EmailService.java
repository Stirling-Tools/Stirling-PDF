package stirling.software.proprietary.security.service;

import static org.apache.commons.lang3.StringUtils.isBlank;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.api.Email;

/**
 * Service class responsible for sending emails, including those with attachments. It uses
 * JavaMailSender to send the email and is designed to handle both the message content and file
 * attachments.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@ConditionalOnProperty(value = "mail.enabled", havingValue = "true", matchIfMissing = false)
public class EmailService {

    private final JavaMailSender mailSender;
    private final ApplicationProperties.Mail mailProperties;

    /**
     * Sends an email with an attachment asynchronously. This method is annotated with @Async, which
     * means it will be executed asynchronously.
     *
     * @param email The Email object containing the recipient, subject, body, and file attachment.
     * @throws MessagingException If there is an issue with creating or sending the email.
     */
    @Async
    public void sendEmailWithAttachment(Email email) throws MessagingException {
        MultipartFile file = email.getFileInput();
        // 1) Validate recipient email address
        if (email.getTo() == null || email.getTo().trim().isEmpty()) {
            throw new MessagingException("Invalid Addresses");
        }

        // 2) Validate attachment
        if (file == null
                || file.isEmpty()
                || file.getOriginalFilename() == null
                || file.getOriginalFilename().isEmpty()) {
            throw new MessagingException("An attachment is required to send the email.");
        }

        sendMessage(email, true);
    }

    private void sendMessage(Email email, boolean multipart) throws MessagingException {
        // Creates a MimeMessage to represent the email
        MimeMessage message = mailSender.createMimeMessage();

        // Helper class to set up the message content and attachments
        MimeMessageHelper helper = new MimeMessageHelper(message, multipart);

        // Sets the recipient, subject, body, and sender email
        helper.addTo(email.getTo());
        helper.setSubject(email.getSubject());
        helper.setText(email.getBody(), true);
        String from =
                isBlank(mailProperties.getFrom())
                        ? "accounts@stirling.com"
                        : mailProperties.getFrom();
        helper.setFrom(from);

        // Adds the attachment to the email if present
        if (multipart && email.getFileInput() != null && !email.getFileInput().isEmpty()) {
            helper.addAttachment(email.getFileInput().getOriginalFilename(), email.getFileInput());
        }

        mailSender.send(message);
    }
}
