package stirling.software.proprietary.security.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;

import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.mail.MessagingException;
import jakarta.ws.rs.core.Response;

import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.proprietary.security.model.api.Email;
import stirling.software.proprietary.security.service.EmailService;

/**
 * Migration (Spring MockMvc -> direct JAX-RS calls): {@code
 * EmailController.sendEmailWithAttachment} now binds multipart form fields directly ({@code
 * FileUpload} + form strings) and returns {@code jakarta.ws.rs.core.Response}. The Spring-specific
 * {@code org.springframework.mail.MailSendException} branch was removed in the migration (see the
 * controller's TODO), so the two MockMvc cases that exercised it are dropped; only the success and
 * generic {@code MessagingException} -> 500 paths remain. The {@code mail.enabled} config field is
 * package-private and assigned directly here since there is no CDI container.
 */
@ExtendWith(MockitoExtension.class)
class EmailControllerTest {

    @Mock private EmailService emailService;

    private EmailController emailController;

    @BeforeEach
    void setUp() {
        emailController = new EmailController(emailService);
        // @ConfigProperty field is not populated without a CDI container; enable mail explicitly.
        emailController.mailEnabled = true;
    }

    @ParameterizedTest(name = "Case {index}: exception={0}")
    @MethodSource("emailParams")
    void shouldHandleEmailRequests(
            Exception serviceException, int expectedStatus, String expectedContent)
            throws Exception {
        if (serviceException == null) {
            doNothing().when(emailService).sendEmailWithAttachment(any(Email.class));
        } else {
            doThrow(serviceException).when(emailService).sendEmailWithAttachment(any(Email.class));
        }

        Response response =
                emailController.sendEmailWithAttachment(
                        TestFileUploads.of(
                                "dummy-content".getBytes(),
                                "fileInput",
                                "application/octet-stream"),
                        "test@example.com",
                        "Test Email",
                        "This is a test email.");

        assertEquals(expectedStatus, response.getStatus());
        assertEquals(expectedContent, response.getEntity());
    }

    static Stream<Arguments> emailParams() {
        return Stream.of(
                // success case
                Arguments.of(null, 200, "Email sent successfully"),
                // generic messaging error
                Arguments.of(
                        new MessagingException("Failed to send email"),
                        500,
                        "Failed to send email: Failed to send email"),
                // invalid email address formatting surfaces as a MessagingException
                Arguments.of(
                        new MessagingException("Invalid Addresses"),
                        500,
                        "Failed to send email: Invalid Addresses"));
    }
}
