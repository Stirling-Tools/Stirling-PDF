package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import io.quarkus.mailer.Mail;
import io.quarkus.mailer.Mailer;

import jakarta.mail.MessagingException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.MultipartFile;
import stirling.software.proprietary.security.model.api.Email;

/**
 * MIGRATION (Spring -> Quarkus): {@link EmailService} now sends via the Quarkus {@link Mailer} (was
 * Spring's {@code JavaMailSender} + {@code MimeMessage}) and the attachment is the {@code
 * stirling.software.common.model.MultipartFile} shim (was Spring's {@code
 * org.springframework.web.multipart.MultipartFile}). Recipient validation now runs before
 * attachment validation, but the thrown {@code MessagingException} messages are unchanged.
 */
@ExtendWith(MockitoExtension.class)
public class EmailServiceTest {

    @Mock private Mailer mailer;

    @Mock private ApplicationProperties applicationProperties;

    @Mock private ApplicationProperties.Mail mailProperties;

    @Mock private MultipartFile fileInput;

    @InjectMocks private EmailService emailService;

    @Test
    void testSendEmailWithAttachment() throws Exception {
        // Mock the values returned by ApplicationProperties
        when(applicationProperties.getMail()).thenReturn(mailProperties);
        when(mailProperties.getFrom()).thenReturn("no-reply@stirling-software.com");

        // Create a mock Email object
        Email email = new Email();
        email.setTo("test@example.com");
        email.setSubject("Test Email");
        email.setBody("This is a test email.");
        email.setFileInput(fileInput);

        // Mock MultipartFile behavior
        when(fileInput.getOriginalFilename()).thenReturn("testFile.txt");
        when(fileInput.getContentType()).thenReturn("text/plain");
        when(fileInput.getBytes()).thenReturn(new byte[] {1, 2, 3});

        // Call the service method
        emailService.sendEmailWithAttachment(email);

        // Verify that the email was sent using the Quarkus Mailer
        verify(mailer).send(any(Mail.class));
    }

    @Test
    void testSendEmailWithAttachmentThrowsExceptionForMissingFilename() {
        Email email = new Email();
        email.setTo("test@example.com");
        email.setSubject("Test Email");
        email.setBody("This is a test email.");
        email.setFileInput(fileInput);

        when(fileInput.isEmpty()).thenReturn(false);
        when(fileInput.getOriginalFilename()).thenReturn("");

        try {
            emailService.sendEmailWithAttachment(email);
            fail("Expected MessagingException to be thrown");
        } catch (MessagingException e) {
            assertEquals("An attachment is required to send the email.", e.getMessage());
        }
    }

    @Test
    void testSendEmailWithAttachmentThrowsExceptionForMissingFilenameNull() {
        Email email = new Email();
        email.setTo("test@example.com");
        email.setSubject("Test Email");
        email.setBody("This is a test email.");
        email.setFileInput(fileInput);

        when(fileInput.isEmpty()).thenReturn(false);
        when(fileInput.getOriginalFilename()).thenReturn(null);

        try {
            emailService.sendEmailWithAttachment(email);
            fail("Expected MessagingException to be thrown");
        } catch (MessagingException e) {
            assertEquals("An attachment is required to send the email.", e.getMessage());
        }
    }

    @Test
    void testSendEmailWithAttachmentThrowsExceptionForMissingFile() {
        Email email = new Email();
        email.setTo("test@example.com");
        email.setSubject("Test Email");
        email.setBody("This is a test email.");
        email.setFileInput(fileInput);

        when(fileInput.isEmpty()).thenReturn(true);

        try {
            emailService.sendEmailWithAttachment(email);
            fail("Expected MessagingException to be thrown");
        } catch (MessagingException e) {
            assertEquals("An attachment is required to send the email.", e.getMessage());
        }
    }

    @Test
    void testSendEmailWithAttachmentThrowsExceptionForMissingFileNull() {
        Email email = new Email();
        email.setTo("test@example.com");
        email.setSubject("Test Email");
        email.setBody("This is a test email.");
        email.setFileInput(null); // Missing file

        try {
            emailService.sendEmailWithAttachment(email);
            fail("Expected MessagingException to be thrown");
        } catch (MessagingException e) {
            assertEquals("An attachment is required to send the email.", e.getMessage());
        }
    }

    @Test
    void testSendEmailWithAttachmentThrowsExceptionForInvalidAddressNull() {
        Email email = new Email();
        email.setTo(null); // Invalid address
        email.setSubject("Test Email");
        email.setBody("This is a test email.");
        email.setFileInput(fileInput);

        try {
            emailService.sendEmailWithAttachment(email);
            fail("Expected MessagingException to be thrown");
        } catch (MessagingException e) {
            assertEquals("Invalid Addresses", e.getMessage());
        }
    }

    @Test
    void testSendEmailWithAttachmentThrowsExceptionForInvalidAddressEmpty() {
        Email email = new Email();
        email.setTo(""); // Invalid address
        email.setSubject("Test Email");
        email.setBody("This is a test email.");
        email.setFileInput(fileInput);

        try {
            emailService.sendEmailWithAttachment(email);
            fail("Expected MessagingException to be thrown");
        } catch (MessagingException e) {
            assertEquals("Invalid Addresses", e.getMessage());
        }
    }
}
