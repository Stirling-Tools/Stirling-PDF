package stirling.software.proprietary.workflow.controller;

import java.io.IOException;
import java.security.Principal;
import java.util.List;

import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import jakarta.validation.constraints.NotBlank;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.SecurityContext;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.workflow.dto.CertificateInfo;
import stirling.software.proprietary.workflow.dto.CertificateValidationResponse;
import stirling.software.proprietary.workflow.dto.ParticipantRequest;
import stirling.software.proprietary.workflow.dto.WorkflowCreationRequest;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.service.CertificateSubmissionValidator;
import stirling.software.proprietary.workflow.service.SigningFinalizationService;
import stirling.software.proprietary.workflow.service.WorkflowSessionService;

@Slf4j
@ApplicationScoped
@Path("/api/v1/security")
@Tag(
        name = "Signing Sessions",
        description = "Signing session lifecycle and participant management")
@RequiredArgsConstructor
public class SigningSessionController {

    private final WorkflowSessionService workflowSessionService;
    private final UserService userService;
    private final SigningFinalizationService signingFinalizationService;
    private final CertificateSubmissionValidator certificateSubmissionValidator;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // JAX-RS injects the current security context; replaces Spring's Principal method parameters.
    // securityContext.getUserPrincipal() is null when unauthenticated.
    @Context SecurityContext securityContext;

    @Operation(summary = "List all signing sessions for current user")
    @Transactional
    @GET
    @Path("/cert-sign/sessions")
    public Response listSessions() {
        workflowSessionService.ensureSigningEnabled();
        Principal principal = securityContext.getUserPrincipal();
        if (principal == null) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity("Authentication required")
                    .build();
        }
        try {
            User user = getCurrentUser(principal);
            List<stirling.software.proprietary.workflow.model.WorkflowSession> sessions =
                    workflowSessionService.listUserSessions(user);
            List<stirling.software.proprietary.workflow.dto.WorkflowSessionResponse> responses =
                    sessions.stream()
                            .map(
                                    stirling.software.proprietary.workflow.util.WorkflowMapper
                                            ::toResponse)
                            .collect(java.util.stream.Collectors.toList());
            return Response.ok(responses).build();
        } catch (Exception e) {
            log.error("Error listing sessions for user {}", principal.getName(), e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity("Error listing sessions")
                    .build();
        }
    }

    @POST
    @Path("/cert-sign/sessions")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Create a shared signing session",
            description =
                    "Starts a collaboration session, distributes share links, and optionally notifies"
                            + " participants. Input:PDF Output:JSON Type:SISO")
    public Response createSession(
            @RestForm("file") FileUpload file,
            // TODO: Migration required - WorkflowCreationRequest is bound here via Spring's
            // @ModelAttribute. RESTEasy Reactive @MultipartForm/@BeanParam can populate this POJO
            // only if its fields are annotated with @RestForm (and any file fields are
            // FileUpload, not the common MultipartFile shim). Verify/annotate
            // WorkflowCreationRequest's fields in the DTO (a collaborator-owned file) for form
            // binding to work.
            @org.jboss.resteasy.reactive.MultipartForm WorkflowCreationRequest request)
            throws Exception {
        workflowSessionService.ensureSigningEnabled();
        Principal principal = securityContext.getUserPrincipal();
        if (principal == null) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity("Authentication required")
                    .build();
        }

        try {
            User owner = getCurrentUser(principal);
            WorkflowSession session =
                    workflowSessionService.createSession(
                            owner, FileUploadMultipartFile.of(file), request);
            return Response.ok(
                            stirling.software.proprietary.workflow.util.WorkflowMapper.toResponse(
                                    session))
                    .build();
        } catch (Exception e) {
            log.error("Error creating signing session", e);
            return Response.status(Response.Status.BAD_REQUEST).entity(e.getMessage()).build();
        }
    }

    @Operation(summary = "Fetch signing session details")
    @Transactional
    @GET
    @Path("/cert-sign/sessions/{sessionId}")
    public Response getSession(@PathParam("sessionId") @NotBlank String sessionId) {
        workflowSessionService.ensureSigningEnabled();
        Principal principal = securityContext.getUserPrincipal();
        if (principal == null) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity("Authentication required")
                    .build();
        }
        try {
            User owner = getCurrentUser(principal);
            WorkflowSession session = workflowSessionService.getSessionForOwner(sessionId, owner);
            // Include wet signatures in response for owner preview
            return Response.ok(
                            stirling.software.proprietary.workflow.util.WorkflowMapper.toResponse(
                                    session, objectMapper))
                    .build();
        } catch (Exception e) {
            log.error("Error fetching session {}", sessionId, e);
            return Response.status(Response.Status.FORBIDDEN)
                    .entity("Access denied or session not found")
                    .build();
        }
    }

    @Operation(summary = "Delete a signing session")
    @DELETE
    @Path("/cert-sign/sessions/{sessionId}")
    public Response deleteSession(@PathParam("sessionId") @NotBlank String sessionId) {
        workflowSessionService.ensureSigningEnabled();
        Principal principal = securityContext.getUserPrincipal();
        if (principal == null) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity("Authentication required")
                    .build();
        }
        try {
            User owner = getCurrentUser(principal);
            workflowSessionService.deleteSession(sessionId, owner);
            return Response.noContent().build();
        } catch (Exception e) {
            log.error("Error deleting session {}", sessionId, e);
            return Response.status(Response.Status.FORBIDDEN)
                    .entity("Cannot delete session: " + e.getMessage())
                    .build();
        }
    }

    @Operation(summary = "Add participants to an existing session")
    @POST
    @Path("/cert-sign/sessions/{sessionId}/participants")
    public Response addParticipants(
            @PathParam("sessionId") @NotBlank String sessionId,
            List<ParticipantRequest> participants) {
        workflowSessionService.ensureSigningEnabled();
        Principal principal = securityContext.getUserPrincipal();
        if (principal == null) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity("Authentication required")
                    .build();
        }
        try {
            User owner = getCurrentUser(principal);
            workflowSessionService.addParticipants(sessionId, participants, owner);
            WorkflowSession session =
                    workflowSessionService.getSessionWithParticipantsForOwner(sessionId, owner);
            return Response.ok(
                            stirling.software.proprietary.workflow.util.WorkflowMapper.toResponse(
                                    session))
                    .build();
        } catch (Exception e) {
            log.error("Error adding participants to session {}", sessionId, e);
            return Response.status(Response.Status.FORBIDDEN)
                    .entity("Cannot add participants: " + e.getMessage())
                    .build();
        }
    }

    @Operation(summary = "Remove a participant from a session")
    @DELETE
    @Path("/cert-sign/sessions/{sessionId}/participants/{participantId}")
    public Response removeParticipant(
            @PathParam("sessionId") @NotBlank String sessionId,
            @PathParam("participantId") Long participantId) {
        workflowSessionService.ensureSigningEnabled();
        Principal principal = securityContext.getUserPrincipal();
        if (principal == null) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity("Authentication required")
                    .build();
        }
        try {
            User owner = getCurrentUser(principal);
            workflowSessionService.removeParticipant(sessionId, participantId, owner);
            return Response.noContent().build();
        } catch (Exception e) {
            log.error("Error removing participant {} from session {}", participantId, sessionId, e);
            return Response.status(Response.Status.FORBIDDEN)
                    .entity("Cannot remove participant: " + e.getMessage())
                    .build();
        }
    }

    @Operation(summary = "Get session PDF for participant view")
    @GET
    @Path("/cert-sign/sessions/{sessionId}/pdf")
    public Response getSessionPdf(@PathParam("sessionId") @NotBlank String sessionId) {
        workflowSessionService.ensureSigningEnabled();
        Principal principal = securityContext.getUserPrincipal();
        if (principal == null) {
            return Response.status(Response.Status.UNAUTHORIZED).build();
        }
        try {
            User owner = getCurrentUser(principal);
            workflowSessionService.getSessionForOwner(sessionId, owner);
            byte[] pdfBytes = workflowSessionService.getOriginalFile(sessionId);
            return WebResponseUtils.bytesToWebResponse(pdfBytes, "document.pdf");
        } catch (Exception e) {
            log.error("Error fetching PDF for session {}", sessionId, e);
            return Response.status(Response.Status.FORBIDDEN).build();
        }
    }

    @POST
    @Path("/cert-sign/sessions/{sessionId}/finalize")
    @Operation(
            summary = "Finalize signing session",
            description =
                    "Applies collected wet signatures and digital certificates, then returns the"
                            + " signed document.")
    @StandardPdfResponse
    public Response finalizeSession(@PathParam("sessionId") @NotBlank String sessionId)
            throws Exception {
        workflowSessionService.ensureSigningEnabled();
        Principal principal = securityContext.getUserPrincipal();
        if (principal == null) {
            return Response.status(Response.Status.UNAUTHORIZED).build();
        }

        try {
            User owner = getCurrentUser(principal);
            WorkflowSession session =
                    workflowSessionService.getSessionWithParticipantsForOwner(sessionId, owner);

            byte[] originalPdf = workflowSessionService.getOriginalFile(sessionId);
            byte[] pdf = signingFinalizationService.finalizeDocument(session, originalPdf);

            String filename = session.getDocumentName().replace(".pdf", "") + "_shared_signed.pdf";
            workflowSessionService.storeProcessedFile(session, pdf, filename);
            workflowSessionService.finalizeSession(sessionId, owner);
            workflowSessionService.deleteOriginalFile(session);

            try {
                signingFinalizationService.clearSensitiveMetadata(session);
            } catch (Exception e) {
                log.error(
                        "SECURITY: Failed to clear sensitive metadata for session {} "
                                + "(participants: {}). Keystore credentials may remain in the "
                                + "database until manual cleanup.",
                        sessionId,
                        session.getParticipants() != null
                                ? session.getParticipants().stream().map(p -> p.getEmail()).toList()
                                : "unknown",
                        e);
                throw new WebApplicationException(
                        "Document signed successfully but post-signing cleanup failed. "
                                + "Contact your administrator to complete the cleanup.",
                        Response.Status.INTERNAL_SERVER_ERROR);
            }

            return WebResponseUtils.bytesToWebResponse(pdf, filename);
        } catch (Exception e) {
            log.error("Error finalizing session {}", sessionId, e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR).build();
        }
    }

    @Operation(summary = "Get signed PDF from finalized session")
    @GET
    @Path("/cert-sign/sessions/{sessionId}/signed-pdf")
    @StandardPdfResponse
    public Response getSignedPdf(@PathParam("sessionId") @NotBlank String sessionId) {
        workflowSessionService.ensureSigningEnabled();
        Principal principal = securityContext.getUserPrincipal();
        if (principal == null) {
            return Response.status(Response.Status.UNAUTHORIZED).build();
        }
        try {
            User owner = getCurrentUser(principal);
            byte[] signedPdf = workflowSessionService.getProcessedFile(sessionId, owner);
            if (signedPdf == null) {
                return Response.status(Response.Status.NOT_FOUND)
                        .entity("Session not finalized".getBytes())
                        .build();
            }
            WorkflowSession session = workflowSessionService.getSessionForOwner(sessionId, owner);
            return WebResponseUtils.bytesToWebResponse(
                    signedPdf,
                    GeneralUtils.generateFilename(session.getDocumentName(), "_shared_signed.pdf"));
        } catch (Exception e) {
            log.error("Error fetching signed PDF for session {}", sessionId, e);
            return Response.status(Response.Status.FORBIDDEN).build();
        }
    }

    // ===== SIGN REQUESTS (Participant View) =====

    @Operation(summary = "List sign requests for authenticated user")
    @Transactional
    @GET
    @Path("/cert-sign/sign-requests")
    public Response listSignRequests() {
        workflowSessionService.ensureSigningEnabled();
        Principal principal = securityContext.getUserPrincipal();
        if (principal == null) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity("Authentication required")
                    .build();
        }
        try {
            User user = getCurrentUser(principal);
            return Response.ok(workflowSessionService.listSignRequests(user)).build();
        } catch (Exception e) {
            log.error("Error listing sign requests for user {}", principal.getName(), e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity("Cannot list sign requests: " + e.getMessage())
                    .build();
        }
    }

    @Transactional
    @Operation(summary = "Get sign request detail for participant")
    @GET
    @Path("/cert-sign/sign-requests/{sessionId}")
    public Response getSignRequestDetail(@PathParam("sessionId") @NotBlank String sessionId) {
        workflowSessionService.ensureSigningEnabled();
        Principal principal = securityContext.getUserPrincipal();
        if (principal == null) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity("Authentication required")
                    .build();
        }
        try {
            User user = getCurrentUser(principal);
            return Response.ok(workflowSessionService.getSignRequestDetail(sessionId, user))
                    .build();
        } catch (Exception e) {
            log.error("Error fetching sign request detail for session {}", sessionId, e);
            return Response.status(Response.Status.FORBIDDEN)
                    .entity("Access denied or sign request not found: " + e.getMessage())
                    .build();
        }
    }

    @Operation(summary = "Get document for sign request")
    @GET
    @Path("/cert-sign/sign-requests/{sessionId}/document")
    public Response getSignRequestDocument(@PathParam("sessionId") @NotBlank String sessionId) {
        workflowSessionService.ensureSigningEnabled();
        Principal principal = securityContext.getUserPrincipal();
        if (principal == null) {
            return Response.status(Response.Status.UNAUTHORIZED).build();
        }
        try {
            User user = getCurrentUser(principal);
            byte[] document = workflowSessionService.getSignRequestDocument(sessionId, user);
            return WebResponseUtils.bytesToWebResponse(document, "document.pdf");
        } catch (Exception e) {
            log.error("Error fetching document for sign request {}", sessionId, e);
            return Response.status(Response.Status.FORBIDDEN).build();
        }
    }

    @Operation(summary = "Sign a document with certificate and optional wet signature")
    @POST
    @Path("/cert-sign/sign-requests/{sessionId}/sign")
    @Consumes({MediaType.MULTIPART_FORM_DATA, MediaType.APPLICATION_FORM_URLENCODED})
    public Response signDocument(
            @PathParam("sessionId") @NotBlank String sessionId,
            // TODO: Migration required - SignDocumentRequest is bound here via Spring's
            // @ModelAttribute. Its file fields (p12File/privateKeyFile/certFile) are typed as the
            // common MultipartFile shim, which RESTEasy Reactive @MultipartForm cannot populate
            // directly (it binds FileUpload + @RestForm). The DTO (collaborator-owned) must expose
            // FileUpload fields with @RestForm and adapt to MultipartFile, or this method must
            // accept the individual @RestForm parts and build the DTO here.
            @org.jboss.resteasy.reactive.MultipartForm
                    stirling.software.proprietary.workflow.dto.SignDocumentRequest request) {
        workflowSessionService.ensureSigningEnabled();
        Principal principal = securityContext.getUserPrincipal();
        if (principal == null) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity("Authentication required")
                    .build();
        }
        try {
            User user = getCurrentUser(principal);
            workflowSessionService.signDocument(sessionId, user, request);
            return Response.noContent().build();
        } catch (IllegalArgumentException e) {
            log.error("Invalid sign request for session {}", sessionId, e);
            return Response.status(Response.Status.BAD_REQUEST).entity(e.getMessage()).build();
        } catch (Exception e) {
            log.error("Error signing document for session {}", sessionId, e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity("Cannot sign document: " + e.getMessage())
                    .build();
        }
    }

    @Operation(summary = "Decline a sign request")
    @POST
    @Path("/cert-sign/sign-requests/{sessionId}/decline")
    public Response declineSignRequest(@PathParam("sessionId") @NotBlank String sessionId) {
        workflowSessionService.ensureSigningEnabled();
        Principal principal = securityContext.getUserPrincipal();
        if (principal == null) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity("Authentication required")
                    .build();
        }
        try {
            User user = getCurrentUser(principal);
            workflowSessionService.declineSignRequest(sessionId, user);
            return Response.noContent().build();
        } catch (Exception e) {
            log.error("Error declining sign request for session {}", sessionId, e);
            return Response.status(Response.Status.FORBIDDEN)
                    .entity("Cannot decline sign request: " + e.getMessage())
                    .build();
        }
    }

    @Operation(
            summary = "Pre-validate a certificate before signing",
            description =
                    "Validates that the provided certificate is loadable, not expired, and can "
                            + "successfully sign a document. Returns validation details so the "
                            + "user can confirm the correct certificate before committing.")
    @POST
    @Path("/cert-sign/validate-certificate")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    public Response validateCertificate(
            @RestForm("certType") String certType,
            @RestForm("password") String password,
            @RestForm("p12File") FileUpload p12File,
            @RestForm("jksFile") FileUpload jksFile) {

        workflowSessionService.ensureSigningEnabled();
        Principal principal = securityContext.getUserPrincipal();
        if (principal == null) {
            return Response.status(Response.Status.UNAUTHORIZED).build();
        }

        stirling.software.common.model.MultipartFile p12 =
                p12File != null ? FileUploadMultipartFile.of(p12File) : null;
        stirling.software.common.model.MultipartFile jks =
                jksFile != null ? FileUploadMultipartFile.of(jksFile) : null;

        if (!"SERVER".equalsIgnoreCase(certType)
                && !"USER_CERT".equalsIgnoreCase(certType)
                && (p12 == null || p12.isEmpty())
                && (jks == null || jks.isEmpty())) {
            throw new WebApplicationException(
                    "No certificate file provided", Response.Status.BAD_REQUEST);
        }

        try {
            byte[] keystoreBytes = null;
            if (p12 != null && !p12.isEmpty()) {
                keystoreBytes = p12.getBytes();
            } else if (jks != null && !jks.isEmpty()) {
                keystoreBytes = jks.getBytes();
            }

            CertificateInfo info =
                    certificateSubmissionValidator.validateAndExtractInfo(
                            keystoreBytes, certType, password);

            if (info == null) {
                return Response.ok(
                                new CertificateValidationResponse(
                                        true, null, null, null, null, false, null))
                        .build();
            }

            return Response.ok(
                            new CertificateValidationResponse(
                                    true,
                                    info.subjectName(),
                                    info.issuerName(),
                                    info.notAfter() != null
                                            ? info.notAfter().toInstant().toString()
                                            : null,
                                    info.notBefore() != null
                                            ? info.notBefore().toInstant().toString()
                                            : null,
                                    info.selfSigned(),
                                    null))
                    .build();

        } catch (WebApplicationException e) {
            return Response.ok(
                            new CertificateValidationResponse(
                                    false, null, null, null, null, false, e.getMessage()))
                    .build();
        } catch (IOException e) {
            log.error("Error reading certificate file during pre-validation", e);
            return Response.ok(
                            new CertificateValidationResponse(
                                    false,
                                    null,
                                    null,
                                    null,
                                    null,
                                    false,
                                    "Failed to read certificate file"))
                    .build();
        }
    }

    // ===== HELPER METHODS =====

    private User getCurrentUser(Principal principal) {
        return userService
                .findByUsernameIgnoreCase(principal.getName())
                .orElseThrow(
                        () ->
                                new WebApplicationException(
                                        "Unauthorized", Response.Status.UNAUTHORIZED));
    }
}
