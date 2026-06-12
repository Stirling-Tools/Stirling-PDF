package stirling.software.proprietary.security.controller.api;

import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.swagger.v3.oas.annotations.Operation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.mail.MessagingException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.proprietary.security.model.api.Email;
import stirling.software.proprietary.security.service.EmailService;

/**
 * Controller for handling email-related API requests. This controller exposes an endpoint for
 * sending emails with attachments.
 */
// TODO: Migration required - Spring @ConditionalOnProperty(mail.enabled) gated bean creation. CDI
// has no direct runtime-toggle equivalent; this controller is always registered and instead guards
// at request time via the injected mail.enabled config below. If the endpoint must be fully absent
// when mail is disabled, wire this with @io.quarkus.arc.lookup.LookupIfProperty or a build-time
// @io.quarkus.arc.profile.IfBuildProfile once a build/runtime decision is made.
@GeneralApi
@Path("/api/v1/general")
@ApplicationScoped
@RequiredArgsConstructor
@Slf4j
public class EmailController {

    private final EmailService emailService;

    @ConfigProperty(name = "mail.enabled", defaultValue = "false")
    boolean mailEnabled;

    /**
     * Endpoint to send an email with an attachment. This method consumes a multipart/form-data
     * request containing the email details and attachment.
     *
     * @return Response with success or error message.
     */
    @POST
    @Path("/send-email")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/send-email",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @Operation(
            summary = "Send an email with an attachment",
            description =
                    "This endpoint sends an email with an attachment. Input:PDF"
                            + " Output:Success/Failure Type:MISO")
    public Response sendEmailWithAttachment(
            @RestForm("fileInput") FileUpload fileUpload,
            @RestForm("to") String to,
            @RestForm("subject") String subject,
            @RestForm("body") String body) {
        // Rebuild the request model from multipart form fields. Email/GeneralFile are not annotated
        // for JAX-RS multipart @BeanParam binding, so we populate them explicitly.
        Email email = new Email();
        if (fileUpload != null) {
            email.setFileInput(FileUploadMultipartFile.of(fileUpload));
        }
        email.setTo(to);
        email.setSubject(subject);
        email.setBody(body);

        if (!mailEnabled) {
            return Response.status(Response.Status.SERVICE_UNAVAILABLE)
                    .entity("Email sending is disabled")
                    .build();
        }

        log.info("Sending email to: {}", email.toString());
        try {
            // Calls the service to send the email with attachment
            emailService.sendEmailWithAttachment(email);
            return Response.ok("Email sent successfully").build();
        } catch (MessagingException e) {
            // Catches any messaging exception (e.g., invalid email address, SMTP server issues).
            // TODO: Migration required - the Spring-specific org.springframework.mail.MailSendException
            // ("Invalid Addresses" case) was previously handled separately. Once EmailService is
            // migrated off Spring's JavaMailSender that branch can be reintroduced with the
            // replacement exception type.
            String errorMsg = "Failed to send email: " + e.getMessage();
            log.error(errorMsg, e); // Logging the detailed error
            // Returns an error response with status 500 (Internal Server Error)
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR).entity(errorMsg).build();
        }
    }
}
