package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.web.multipart.MultipartFile;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.api.Email;

@ExtendWith(MockitoExtension.class)
public class EmailServiceTest {

    @Mock private JavaMailSender mailSender;

    @Mock private ApplicationProperties applicationProperties;

    @Mock private ApplicationProperties.Mail mailProperties;

    @Mock private MultipartFile fileInput;

    @InjectMocks private EmailService emailService;

    @Test
    void testSendEmailWithAttachment() throws MessagingException {
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

        // Mock MimeMessage
        MimeMessage mimeMessage = mock(MimeMessage.class);

        // Configure mailSender to return the mocked MimeMessage
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

        // Call the service method
        emailService.sendEmailWithAttachment(email);

        // Verify that the email was sent using mailSender
        verify(mailSender).send(mimeMessage);
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
            fail("Expected MailSendException to be thrown");
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
            fail("Expected MailSendException to be thrown");
        } catch (MessagingException e) {
            assertEquals("Invalid Addresses", e.getMessage());
        }
    }

    @Test
    void sendSigningInvitationEmail_sendsEmailWithDocumentNameInSubject()
            throws MessagingException {
        when(applicationProperties.getMail()).thenReturn(mailProperties);
        when(mailProperties.getFrom()).thenReturn("no-reply@stirling-software.com");
        MimeMessage mimeMessage = mock(MimeMessage.class);
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

        emailService.sendSigningInvitationEmail(
                "guest@example.com",
                "Alice Owner",
                "Contract 2025.pdf",
                "https://example.com/sign/abc-token",
                "2025-12-31",
                "Please review and sign");

        verify(mailSender).send(mimeMessage);
    }

    @Test
    void sendSigningInvitationEmail_throwsForBlankRecipient() {
        assertThrows(
                MessagingException.class,
                () ->
                        emailService.sendSigningInvitationEmail(
                                "",
                                "Owner",
                                "Doc.pdf",
                                "https://example.com/sign/tok",
                                null,
                                null));
    }

    // ── HTML injection / URL guard tests ──────────────────────────────────

    @Test
    void sendSigningInvitationEmail_doesNotThrowForHtmlInDocumentName() throws MessagingException {
        when(applicationProperties.getMail()).thenReturn(mailProperties);
        when(mailProperties.getFrom()).thenReturn("no-reply@stirling.com");
        MimeMessage mimeMessage = mock(MimeMessage.class);
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

        // Document name with injected HTML — must not cause an exception
        emailService.sendSigningInvitationEmail(
                "guest@example.com",
                "Alice",
                "<script>alert('xss')</script>Contract.pdf",
                "https://example.com/sign/tok",
                null,
                null);

        verify(mailSender).send(mimeMessage);
    }

    @Test
    void sendSigningInvitationEmail_doesNotThrowForHtmlInMessage() throws MessagingException {
        when(applicationProperties.getMail()).thenReturn(mailProperties);
        when(mailProperties.getFrom()).thenReturn("no-reply@stirling.com");
        MimeMessage mimeMessage = mock(MimeMessage.class);
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

        // Personal message with HTML injection
        emailService.sendSigningInvitationEmail(
                "guest@example.com",
                "Bob <b>Owner</b>",
                "Contract.pdf",
                "https://example.com/sign/tok",
                "2026-12-31",
                "<img src=x onerror=alert(1)> Please sign");

        verify(mailSender).send(mimeMessage);
    }

    @Test
    void sendSigningInvitationEmail_doesNotThrowForJavascriptUrl() throws MessagingException {
        when(applicationProperties.getMail()).thenReturn(mailProperties);
        when(mailProperties.getFrom()).thenReturn("no-reply@stirling.com");
        MimeMessage mimeMessage = mock(MimeMessage.class);
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

        // javascript: URL — must be replaced with '#', not thrown into email
        emailService.sendSigningInvitationEmail(
                "guest@example.com",
                "Owner",
                "Contract.pdf",
                "javascript:alert(document.cookie)",
                null,
                null);

        verify(mailSender).send(mimeMessage);
    }

    @Test
    void sendSigningInvitationEmail_acceptsNullOptionalParams() throws MessagingException {
        when(applicationProperties.getMail()).thenReturn(mailProperties);
        when(mailProperties.getFrom()).thenReturn("no-reply@stirling.com");
        MimeMessage mimeMessage = mock(MimeMessage.class);
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

        // expiresAt and message are optional — null values must not cause NPE
        emailService.sendSigningInvitationEmail(
                "guest@example.com", null, null, "https://example.com/sign/tok", null, null);

        verify(mailSender).send(mimeMessage);
    }
}
