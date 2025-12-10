package stirling.software.proprietary.security.service;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.api.Email;

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

        ApplicationProperties.Mail mailProperties = applicationProperties.getMail();

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

    /**
     * Sends a plain text/HTML email without attachments asynchronously.
     *
     * @param to The recipient email address
     * @param subject The email subject
     * @param body The email body (can contain HTML)
     * @param isHtml Whether the body contains HTML content
     * @throws MessagingException If there is an issue with creating or sending the email.
     */
    @Async
    public void sendPlainEmail(String to, String subject, String body, boolean isHtml)
            throws MessagingException {
        // Validate recipient email address
        if (to == null || to.trim().isEmpty()) {
            throw new MessagingException("Invalid recipient email address");
        }

        ApplicationProperties.Mail mailProperties = applicationProperties.getMail();

        // Creates a MimeMessage to represent the email
        MimeMessage message = mailSender.createMimeMessage();

        // Helper class to set up the message content
        MimeMessageHelper helper = new MimeMessageHelper(message, false);

        // Sets the recipient, subject, body, and sender email
        helper.addTo(to);
        helper.setSubject(subject);
        helper.setText(body, isHtml);
        helper.setFrom(mailProperties.getFrom());

        // Sends the email via the configured mail sender
        mailSender.send(message);
    }

    /**
     * Sends an invitation email to a new user with their credentials.
     *
     * @param to The recipient email address
     * @param username The username for the new account
     * @param temporaryPassword The temporary password
     * @param loginUrl The URL to the login page
     * @throws MessagingException If there is an issue with creating or sending the email.
     */
    @Async
    public void sendInviteEmail(
            String to, String username, String temporaryPassword, String loginUrl)
            throws MessagingException {
        String subject = "Welcome to Stirling PDF";

        String body =
                """
                <html><body style="margin: 0; padding: 0;">
                <div style="font-family: Arial, sans-serif; background-color: #f8f9fa; padding: 20px;">
                  <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0;">
                    <!-- Logo -->
                    <div style="text-align: center; padding: 20px; background-color: #222;">
                      <img src="https://raw.githubusercontent.com/Stirling-Tools/Stirling-PDF/main/docs/stirling-transparent.svg" alt="Stirling PDF" style="max-height: 60px;">
                    </div>
                    <!-- Content -->
                    <div style="padding: 30px; color: #333;">
                      <h2 style="color: #222; margin-top: 0;">Welcome to Stirling PDF!</h2>
                      <p>Hi there,</p>
                      <p>You have been invited to join the workspace. Below are your login credentials:</p>
                      <!-- Credentials Box -->
                      <div style="background-color: #f8f9fa; border-left: 4px solid #007bff; padding: 15px; margin: 20px 0; border-radius: 4px;">
                        <p style="margin: 0 0 10px 0;"><strong>Username:</strong> %s</p>
                        <p style="margin: 0;"><strong>Temporary Password:</strong> %s</p>
                      </div>
                      <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
                        <p style="margin: 0; color: #856404;"><strong>⚠️ Important:</strong> You will be required to change your password upon first login for security reasons.</p>
                      </div>
                      <!-- CTA Button -->
                      <div style="text-align: center; margin: 30px 0;">
                        <a href="%s" style="display: inline-block; background-color: #007bff; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 5px; font-weight: bold;">Log In to Stirling PDF</a>
                      </div>
                      <p style="font-size: 14px; color: #666;">Or copy and paste this link in your browser:</p>
                      <div style="background-color: #f8f9fa; padding: 12px; margin: 15px 0; border-radius: 4px; word-break: break-all; font-size: 13px; color: #555;">
                        %s
                      </div>
                      <p>Please keep these credentials secure and do not share them with anyone.</p>
                      <p style="margin-bottom: 0;">— The Stirling PDF Team</p>
                    </div>
                    <!-- Footer -->
                    <div style="text-align: center; padding: 15px; font-size: 12px; color: #777; background-color: #f0f0f0;">
                      &copy; 2025 Stirling PDF. All rights reserved.
                    </div>
                  </div>
                </div>
                </body></html>
                """
                        .formatted(username, temporaryPassword, loginUrl, loginUrl);

        sendPlainEmail(to, subject, body, true);
    }

    /**
     * Sends an invitation link email to a new user.
     *
     * @param to The recipient email address
     * @param inviteUrl The full URL for accepting the invite
     * @param expiresAt The expiration timestamp
     * @throws MessagingException If there is an issue with creating or sending the email.
     */
    @Async
    public void sendInviteLinkEmail(String to, String inviteUrl, String expiresAt)
            throws MessagingException {
        String subject = "You've been invited to Stirling PDF";

        String body =
                """
                <html><body style="margin: 0; padding: 0;">
                <div style="font-family: Arial, sans-serif; background-color: #f8f9fa; padding: 20px;">
                  <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0;">
                    <!-- Logo -->
                    <div style="text-align: center; padding: 20px; background-color: #222;">
                      <img src="https://raw.githubusercontent.com/Stirling-Tools/Stirling-PDF/main/docs/stirling-transparent.svg" alt="Stirling PDF" style="max-height: 60px;">
                    </div>
                    <!-- Content -->
                    <div style="padding: 30px; color: #333;">
                      <h2 style="color: #222; margin-top: 0;">Welcome to Stirling PDF!</h2>
                      <p>Hi there,</p>
                      <p>You have been invited to join the Stirling PDF workspace. Click the button below to set up your account:</p>
                      <!-- CTA Button -->
                      <div style="text-align: center; margin: 30px 0;">
                        <a href="%s" style="display: inline-block; background-color: #007bff; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 5px; font-weight: bold;">Accept Invitation</a>
                      </div>
                      <p style="font-size: 14px; color: #666;">Or copy and paste this link in your browser:</p>
                      <div style="background-color: #f8f9fa; padding: 12px; margin: 15px 0; border-radius: 4px; word-break: break-all; font-size: 13px; color: #555;">
                        %s
                      </div>
                      <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
                        <p style="margin: 0; color: #856404; font-size: 14px;"><strong>⚠️ Important:</strong> This invitation link will expire on %s. Please complete your registration before then.</p>
                      </div>
                      <p>If you didn't expect this invitation, you can safely ignore this email.</p>
                      <p style="margin-bottom: 0;">— The Stirling PDF Team</p>
                    </div>
                    <!-- Footer -->
                    <div style="text-align: center; padding: 15px; font-size: 12px; color: #777; background-color: #f0f0f0;">
                      &copy; 2025 Stirling PDF. All rights reserved.
                    </div>
                  </div>
                </div>
                </body></html>
                """
                        .formatted(inviteUrl, inviteUrl, expiresAt);

        sendPlainEmail(to, subject, body, true);
    }

    @Async
    public void sendPasswordChangedNotification(
            String to, String username, String newPassword, String loginUrl)
            throws MessagingException {
        String subject = "Your Stirling PDF password has been updated";

        String passwordSection =
                newPassword == null
                        ? ""
                        : """
                          <div style=\"background-color: #f8f9fa; border-left: 4px solid #007bff; padding: 15px; margin: 20px 0; border-radius: 4px;\">
                            <p style=\"margin: 0;\"><strong>Temporary Password:</strong> %s</p>
                          </div>
                        """
                                .formatted(newPassword);

        String body =
                """
                <html><body style=\"margin: 0; padding: 0;\">
                <div style=\"font-family: Arial, sans-serif; background-color: #f8f9fa; padding: 20px;\">
                  <div style=\"max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0;\">
                    <div style=\"text-align: center; padding: 20px; background-color: #222;\">
                      <img src=\"https://raw.githubusercontent.com/Stirling-Tools/Stirling-PDF/main/docs/stirling-transparent.svg\" alt=\"Stirling PDF\" style=\"max-height: 60px;\">
                    </div>
                    <div style=\"padding: 30px; color: #333;\">
                      <h2 style=\"color: #222; margin-top: 0;\">Your password was changed</h2>
                      <p>Hello %s,</p>
                      <p>An administrator has updated the password for your Stirling PDF account.</p>
                      %s
                      <p>If you did not expect this change, please contact your administrator immediately.</p>
                      <div style=\"text-align: center; margin: 30px 0;\">
                        <a href=\"%s\" style=\"display: inline-block; background-color: #007bff; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 5px; font-weight: bold;\">Go to Stirling PDF</a>
                      </div>
                      <p style=\"font-size: 14px; color: #666;\">Or copy and paste this link in your browser:</p>
                      <div style=\"background-color: #f8f9fa; padding: 12px; margin: 15px 0; border-radius: 4px; word-break: break-all; font-size: 13px; color: #555;\">
                        %s
                      </div>
                    </div>
                    <div style=\"text-align: center; padding: 15px; font-size: 12px; color: #777; background-color: #f0f0f0;\">
                      &copy; 2025 Stirling PDF. All rights reserved.
                    </div>
                  </div>
                </div>
                </body></html>
                """
                        .formatted(username, passwordSection, loginUrl, loginUrl);

        sendPlainEmail(to, subject, body, true);
    }
}
