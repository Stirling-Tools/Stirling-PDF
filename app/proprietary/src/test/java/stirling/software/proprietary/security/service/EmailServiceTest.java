package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.web.multipart.MultipartFile;

import jakarta.mail.BodyPart;
import jakarta.mail.MessagingException;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeBodyPart;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;

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
    void sendBrandedEmailAttachesTheLockupInlineAfterTheHtmlBody() throws Exception {
        when(applicationProperties.getMail()).thenReturn(mailProperties);
        when(mailProperties.getFrom()).thenReturn("no-reply@stirling-software.com");
        when(mailSender.createMimeMessage()).thenReturn(new MimeMessage((Session) null));

        emailService.sendBrandedEmail(
                "test@example.com", "Signed", "<p><img src=\"cid:stirling-logo\"></p>");

        ArgumentCaptor<MimeMessage> sent = ArgumentCaptor.forClass(MimeMessage.class);
        verify(mailSender).send(sent.capture());
        MimeMessage message = sent.getValue();
        message.saveChanges();
        MimeMultipart related = (MimeMultipart) message.getContent();
        assertTrue(related.getContentType().startsWith("multipart/related"));
        assertEquals(2, related.getCount());

        BodyPart html = related.getBodyPart(0);
        assertTrue(html.isMimeType("text/html"));
        MimeBodyPart logo = (MimeBodyPart) related.getBodyPart(1);
        assertEquals("<" + EmailService.BRAND_LOGO_CONTENT_ID + ">", logo.getContentID());
        assertEquals(Part.INLINE, logo.getDisposition());
        assertTrue(logo.isMimeType("image/png"));
        byte[] png = logo.getInputStream().readAllBytes();
        assertEquals((byte) 0x89, png[0]);
        assertEquals("PNG", new String(png, 1, 3, StandardCharsets.US_ASCII));
    }

    @Test
    void sendBrandedEmailRejectsABlankRecipient() {
        MessagingException e =
                assertThrows(
                        MessagingException.class,
                        () -> emailService.sendBrandedEmail(" ", "Signed", "<p>x</p>"));

        assertEquals("Invalid recipient email address", e.getMessage());
        verifyNoInteractions(mailSender);
    }
}
