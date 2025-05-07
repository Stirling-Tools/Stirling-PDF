package stirling.software.SPDF.controller.api;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import jakarta.mail.MessagingException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.multipart.MultipartFile;
import stirling.software.SPDF.config.security.mail.EmailService;
import stirling.software.SPDF.model.api.Email;

@ExtendWith(MockitoExtension.class)
public class EmailControllerTest {

    private MockMvc mockMvc;

    @Mock private EmailService emailService;

    @InjectMocks private EmailController emailController;

    @Mock private MultipartFile fileInput;

    @BeforeEach
    void setUp() {
        // Set up the MockMvc instance for testing
        mockMvc = MockMvcBuilders.standaloneSetup(emailController).build();
    }

    @Test
    void testSendEmailWithAttachmentSuccess() throws Exception {
        // Create a mock Email object
        Email email = new Email();
        email.setTo("test@example.com");
        email.setSubject("Test Email");
        email.setBody("This is a test email.");
        email.setFileInput(fileInput);

        // Mock the service to not throw any exception
        doNothing().when(emailService).sendEmailWithAttachment(any(Email.class));

        // Perform the request and verify the response
        mockMvc.perform(
                        multipart("/api/v1/general/send-email")
                                .file("fileInput", "dummy-content".getBytes())
                                .param("to", email.getTo())
                                .param("subject", email.getSubject())
                                .param("body", email.getBody()))
                .andExpect(status().isOk())
                .andExpect(content().string("Email sent successfully"));
    }

    @Test
    void testSendEmailWithAttachmentFailure() throws Exception {
        // Create a mock Email object
        Email email = new Email();
        email.setTo("test@example.com");
        email.setSubject("Test Email");
        email.setBody("This is a test email.");
        email.setFileInput(fileInput);

        // Mock the service to throw a MessagingException
        doThrow(new MessagingException("Failed to send email"))
                .when(emailService)
                .sendEmailWithAttachment(any(Email.class));

        // Perform the request and verify the response
        mockMvc.perform(
                        multipart("/api/v1/general/send-email")
                                .file("fileInput", "dummy-content".getBytes())
                                .param("to", email.getTo())
                                .param("subject", email.getSubject())
                                .param("body", email.getBody()))
                .andExpect(status().isInternalServerError())
                .andExpect(content().string("Failed to send email: Failed to send email"));
    }
}
