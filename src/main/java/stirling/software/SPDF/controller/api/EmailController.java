package stirling.software.SPDF.controller.api;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mail.MailSendException;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.mail.MessagingException;
import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.security.mail.EmailService;
import stirling.software.SPDF.model.api.Email;

/**
 * Controller for handling email-related API requests. This controller exposes an endpoint for
 * sending emails with attachments.
 */
@RestController
@RequestMapping("/api/v1/general")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "General", description = "General APIs")
@ConditionalOnProperty(value = "mail.enabled", havingValue = "true", matchIfMissing = false)
public class EmailController {
    private final EmailService emailService;

    /**
     * Endpoint to send an email with an attachment. This method consumes a multipart/form-data
     * request containing the email details and attachment.
     *
     * @param email The Email object containing recipient address, subject, body, and file
     *     attachment.
     * @return ResponseEntity with success or error message.
     */
    @PostMapping(consumes = "multipart/form-data", value = "/send-email")
    @Operation(
            summary = "Send an email with an attachment",
            description =
                    "This endpoint sends an email with an attachment. Input:PDF"
                            + " Output:Success/Failure Type:MISO")
    public ResponseEntity<String> sendEmailWithAttachment(@Valid @ModelAttribute Email email) {
        log.info("Sending email to: {}", email.toString());
        try {
            // Calls the service to send the email with attachment
            emailService.sendEmailWithAttachment(email);
            return ResponseEntity.ok("Email sent successfully");
        } catch (MailSendException ex) {
            // handles your "Invalid Addresses" case
            String errorMsg = ex.getMessage();
            log.error("MailSendException: {}", errorMsg, ex);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorMsg);
        } catch (MessagingException e) {
            // Catches any messaging exception (e.g., invalid email address, SMTP server issues)
            String errorMsg = "Failed to send email: " + e.getMessage();
            log.error(errorMsg, e); // Logging the detailed error
            // Returns an error response with status 500 (Internal Server Error)
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorMsg);
        }
    }
}
