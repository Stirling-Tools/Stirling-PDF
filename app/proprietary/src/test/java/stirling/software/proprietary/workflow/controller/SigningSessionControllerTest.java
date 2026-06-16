package stirling.software.proprietary.workflow.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.security.Principal;
import java.util.Date;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.workflow.dto.CertificateInfo;
import stirling.software.proprietary.workflow.dto.CertificateValidationResponse;
import stirling.software.proprietary.workflow.dto.ParticipantRequest;
import stirling.software.proprietary.workflow.dto.SignDocumentRequest;
import stirling.software.proprietary.workflow.dto.WorkflowCreationRequest;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.model.WorkflowType;
import stirling.software.proprietary.workflow.service.CertificateSubmissionValidator;
import stirling.software.proprietary.workflow.service.SigningFinalizationService;
import stirling.software.proprietary.workflow.service.WorkflowSessionService;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("SigningSessionController")
class SigningSessionControllerTest {

    @Mock private WorkflowSessionService workflowSessionService;
    @Mock private UserService userService;
    @Mock private SigningFinalizationService signingFinalizationService;
    @Mock private CertificateSubmissionValidator certificateSubmissionValidator;

    private SigningSessionController controller;

    private static final String SESSION_ID = "session-123";
    private static final String USERNAME = "owner@example.com";

    private User owner;
    private Principal principal;

    @BeforeEach
    void setUp() {
        controller =
                new SigningSessionController(
                        workflowSessionService,
                        userService,
                        signingFinalizationService,
                        certificateSubmissionValidator);

        owner = new User();
        owner.setId(1L);
        owner.setUsername(USERNAME);

        principal = () -> USERNAME;
    }

    /** Builds a minimal but fully-mappable WorkflowSession (owner + empty participant list). */
    private WorkflowSession newSession() {
        WorkflowSession session = new WorkflowSession();
        session.setSessionId(SESSION_ID);
        session.setOwner(owner);
        session.setWorkflowType(WorkflowType.SIGNING);
        session.setDocumentName("contract.pdf");
        return session;
    }

    private void stubCurrentUser() {
        when(userService.findByUsernameIgnoreCase(USERNAME)).thenReturn(Optional.of(owner));
    }

    // ===================================================================
    // listSessions
    // ===================================================================

    @Nested
    @DisplayName("listSessions")
    class ListSessions {

        @Test
        @DisplayName("returns 401 when principal is null")
        void unauthorizedWhenNoPrincipal() {
            ResponseEntity<?> response = controller.listSessions(null);

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
            assertEquals("Authentication required", response.getBody());
            verify(workflowSessionService).ensureSigningEnabled();
            verify(workflowSessionService, never()).listUserSessions(any());
        }

        @Test
        @DisplayName("returns 200 with mapped sessions on success")
        void okWithSessions() {
            stubCurrentUser();
            when(workflowSessionService.listUserSessions(owner)).thenReturn(List.of(newSession()));

            ResponseEntity<?> response = controller.listSessions(principal);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertInstanceOf(List.class, response.getBody());
            assertEquals(1, ((List<?>) response.getBody()).size());
        }

        @Test
        @DisplayName("returns 500 when service throws unexpectedly")
        void internalServerErrorOnFailure() {
            stubCurrentUser();
            when(workflowSessionService.listUserSessions(owner))
                    .thenThrow(new RuntimeException("db down"));

            ResponseEntity<?> response = controller.listSessions(principal);

            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
            assertEquals("Error listing sessions", response.getBody());
        }

        @Test
        @DisplayName("propagates ResponseStatusException when signing disabled")
        void signingDisabledPropagates() {
            doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "disabled"))
                    .when(workflowSessionService)
                    .ensureSigningEnabled();

            assertThrows(ResponseStatusException.class, () -> controller.listSessions(principal));
        }
    }

    // ===================================================================
    // createSession
    // ===================================================================

    @Nested
    @DisplayName("createSession")
    class CreateSession {

        @Test
        @DisplayName("returns 401 when principal is null")
        void unauthorizedWhenNoPrincipal() throws Exception {
            MultipartFile file = mockFile();
            WorkflowCreationRequest request = new WorkflowCreationRequest();

            ResponseEntity<?> response = controller.createSession(file, request, null);

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
            assertEquals("Authentication required", response.getBody());
            verify(workflowSessionService, never()).createSession(any(), any(), any());
        }

        @Test
        @DisplayName("returns 200 with mapped session on success")
        void okOnSuccess() throws Exception {
            MultipartFile file = mockFile();
            WorkflowCreationRequest request = new WorkflowCreationRequest();
            stubCurrentUser();
            when(workflowSessionService.createSession(owner, file, request))
                    .thenReturn(newSession());

            ResponseEntity<?> response = controller.createSession(file, request, principal);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("returns 400 with message when creation fails")
        void badRequestOnFailure() throws Exception {
            MultipartFile file = mockFile();
            WorkflowCreationRequest request = new WorkflowCreationRequest();
            stubCurrentUser();
            when(workflowSessionService.createSession(owner, file, request))
                    .thenThrow(new IllegalStateException("File is required"));

            ResponseEntity<?> response = controller.createSession(file, request, principal);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("File is required", response.getBody());
        }

        private MultipartFile mockFile() {
            MultipartFile file = org.mockito.Mockito.mock(MultipartFile.class);
            return file;
        }
    }

    // ===================================================================
    // getSession
    // ===================================================================

    @Nested
    @DisplayName("getSession")
    class GetSession {

        @Test
        @DisplayName("returns 401 when principal is null")
        void unauthorizedWhenNoPrincipal() {
            ResponseEntity<?> response = controller.getSession(SESSION_ID, null);

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
            assertEquals("Authentication required", response.getBody());
        }

        @Test
        @DisplayName("returns 200 with mapped session for owner")
        void okForOwner() {
            stubCurrentUser();
            when(workflowSessionService.getSessionForOwner(SESSION_ID, owner))
                    .thenReturn(newSession());

            ResponseEntity<?> response = controller.getSession(SESSION_ID, principal);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("returns 403 when access is denied")
        void forbiddenWhenDenied() {
            stubCurrentUser();
            when(workflowSessionService.getSessionForOwner(SESSION_ID, owner))
                    .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "nope"));

            ResponseEntity<?> response = controller.getSession(SESSION_ID, principal);

            assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
            assertEquals("Access denied or session not found", response.getBody());
        }
    }

    // ===================================================================
    // deleteSession
    // ===================================================================

    @Nested
    @DisplayName("deleteSession")
    class DeleteSession {

        @Test
        @DisplayName("returns 401 when principal is null")
        void unauthorizedWhenNoPrincipal() {
            ResponseEntity<?> response = controller.deleteSession(SESSION_ID, null);

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
            verify(workflowSessionService, never()).deleteSession(any(), any());
        }

        @Test
        @DisplayName("returns 204 on successful delete")
        void noContentOnSuccess() {
            stubCurrentUser();
            doNothing().when(workflowSessionService).deleteSession(SESSION_ID, owner);

            ResponseEntity<?> response = controller.deleteSession(SESSION_ID, principal);

            assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
            verify(workflowSessionService).deleteSession(SESSION_ID, owner);
        }

        @Test
        @DisplayName("returns 403 with reason when delete fails")
        void forbiddenOnFailure() {
            stubCurrentUser();
            doThrow(new IllegalStateException("finalized"))
                    .when(workflowSessionService)
                    .deleteSession(SESSION_ID, owner);

            ResponseEntity<?> response = controller.deleteSession(SESSION_ID, principal);

            assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
            assertEquals("Cannot delete session: finalized", response.getBody());
        }
    }

    // ===================================================================
    // addParticipants
    // ===================================================================

    @Nested
    @DisplayName("addParticipants")
    class AddParticipants {

        @Test
        @DisplayName("returns 401 when principal is null")
        void unauthorizedWhenNoPrincipal() {
            ResponseEntity<?> response = controller.addParticipants(SESSION_ID, List.of(), null);

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
            verify(workflowSessionService, never()).addParticipants(any(), any(), any());
        }

        @Test
        @DisplayName("returns 200 with updated session on success")
        void okOnSuccess() {
            List<ParticipantRequest> participants = List.of(new ParticipantRequest());
            stubCurrentUser();
            doNothing()
                    .when(workflowSessionService)
                    .addParticipants(SESSION_ID, participants, owner);
            when(workflowSessionService.getSessionWithParticipantsForOwner(SESSION_ID, owner))
                    .thenReturn(newSession());

            ResponseEntity<?> response =
                    controller.addParticipants(SESSION_ID, participants, principal);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            verify(workflowSessionService).addParticipants(SESSION_ID, participants, owner);
        }

        @Test
        @DisplayName("returns 403 with reason when add fails")
        void forbiddenOnFailure() {
            List<ParticipantRequest> participants = List.of(new ParticipantRequest());
            stubCurrentUser();
            doThrow(new IllegalStateException("inactive"))
                    .when(workflowSessionService)
                    .addParticipants(SESSION_ID, participants, owner);

            ResponseEntity<?> response =
                    controller.addParticipants(SESSION_ID, participants, principal);

            assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
            assertEquals("Cannot add participants: inactive", response.getBody());
        }
    }

    // ===================================================================
    // removeParticipant
    // ===================================================================

    @Nested
    @DisplayName("removeParticipant")
    class RemoveParticipant {

        @Test
        @DisplayName("returns 401 when principal is null")
        void unauthorizedWhenNoPrincipal() {
            ResponseEntity<?> response = controller.removeParticipant(SESSION_ID, 5L, null);

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
            verify(workflowSessionService, never()).removeParticipant(any(), any(), any());
        }

        @Test
        @DisplayName("returns 204 on successful removal")
        void noContentOnSuccess() {
            stubCurrentUser();
            doNothing().when(workflowSessionService).removeParticipant(SESSION_ID, 5L, owner);

            ResponseEntity<?> response = controller.removeParticipant(SESSION_ID, 5L, principal);

            assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
            verify(workflowSessionService).removeParticipant(SESSION_ID, 5L, owner);
        }

        @Test
        @DisplayName("returns 403 with reason when removal fails")
        void forbiddenOnFailure() {
            stubCurrentUser();
            doThrow(new IllegalStateException("not found"))
                    .when(workflowSessionService)
                    .removeParticipant(SESSION_ID, 5L, owner);

            ResponseEntity<?> response = controller.removeParticipant(SESSION_ID, 5L, principal);

            assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
            assertEquals("Cannot remove participant: not found", response.getBody());
        }
    }

    // ===================================================================
    // getSessionPdf
    // ===================================================================

    @Nested
    @DisplayName("getSessionPdf")
    class GetSessionPdf {

        @Test
        @DisplayName("returns 401 when principal is null")
        void unauthorizedWhenNoPrincipal() {
            ResponseEntity<byte[]> response = controller.getSessionPdf(SESSION_ID, null);

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
        }

        @Test
        @DisplayName("returns 200 with PDF bytes on success")
        void okWithPdf() throws Exception {
            byte[] pdf = new byte[] {1, 2, 3};
            stubCurrentUser();
            when(workflowSessionService.getSessionForOwner(SESSION_ID, owner))
                    .thenReturn(newSession());
            when(workflowSessionService.getOriginalFile(SESSION_ID)).thenReturn(pdf);

            ResponseEntity<byte[]> response = controller.getSessionPdf(SESSION_ID, principal);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals(pdf, response.getBody());
        }

        @Test
        @DisplayName("returns 403 when retrieval fails")
        void forbiddenOnFailure() throws Exception {
            stubCurrentUser();
            when(workflowSessionService.getSessionForOwner(SESSION_ID, owner))
                    .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "denied"));

            ResponseEntity<byte[]> response = controller.getSessionPdf(SESSION_ID, principal);

            assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        }
    }

    // ===================================================================
    // finalizeSession
    // ===================================================================

    @Nested
    @DisplayName("finalizeSession")
    class FinalizeSession {

        @Test
        @DisplayName("returns 401 when principal is null")
        void unauthorizedWhenNoPrincipal() throws Exception {
            ResponseEntity<byte[]> response = controller.finalizeSession(SESSION_ID, null);

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
            verify(signingFinalizationService, never()).finalizeDocument(any(), any());
        }

        @Test
        @DisplayName("returns 200 with signed PDF and runs the full finalize pipeline")
        void okOnFullPipeline() throws Exception {
            WorkflowSession session = newSession();
            byte[] original = new byte[] {9};
            byte[] signed = new byte[] {7, 7};
            stubCurrentUser();
            when(workflowSessionService.getSessionWithParticipantsForOwner(SESSION_ID, owner))
                    .thenReturn(session);
            when(workflowSessionService.getOriginalFile(SESSION_ID)).thenReturn(original);
            when(signingFinalizationService.finalizeDocument(session, original)).thenReturn(signed);

            ResponseEntity<byte[]> response = controller.finalizeSession(SESSION_ID, principal);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals(signed, response.getBody());
            verify(workflowSessionService)
                    .storeProcessedFile(eq(session), eq(signed), any(String.class));
            verify(workflowSessionService).finalizeSession(SESSION_ID, owner);
            verify(workflowSessionService).deleteOriginalFile(session);
            verify(signingFinalizationService).clearSensitiveMetadata(session);
        }

        @Test
        @DisplayName("derives the signed filename from the document name")
        void filenameDerivedFromDocumentName() throws Exception {
            WorkflowSession session = newSession();
            session.setDocumentName("My Report.pdf");
            stubCurrentUser();
            when(workflowSessionService.getSessionWithParticipantsForOwner(SESSION_ID, owner))
                    .thenReturn(session);
            when(workflowSessionService.getOriginalFile(SESSION_ID)).thenReturn(new byte[] {1});
            when(signingFinalizationService.finalizeDocument(any(), any()))
                    .thenReturn(new byte[] {2});

            controller.finalizeSession(SESSION_ID, principal);

            verify(workflowSessionService)
                    .storeProcessedFile(eq(session), any(), eq("My Report_shared_signed.pdf"));
        }

        @Test
        @DisplayName("returns 500 when finalization fails")
        void internalServerErrorOnFailure() throws Exception {
            stubCurrentUser();
            when(workflowSessionService.getSessionWithParticipantsForOwner(SESSION_ID, owner))
                    .thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND, "missing"));

            ResponseEntity<byte[]> response = controller.finalizeSession(SESSION_ID, principal);

            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
        }

        @Test
        @DisplayName("swallows cleanup ResponseStatusException into 500 (caught by outer handler)")
        void cleanupFailureBecomes500() throws Exception {
            WorkflowSession session = newSession();
            stubCurrentUser();
            when(workflowSessionService.getSessionWithParticipantsForOwner(SESSION_ID, owner))
                    .thenReturn(session);
            when(workflowSessionService.getOriginalFile(SESSION_ID)).thenReturn(new byte[] {1});
            when(signingFinalizationService.finalizeDocument(any(), any()))
                    .thenReturn(new byte[] {2});
            doThrow(new RuntimeException("cleanup boom"))
                    .when(signingFinalizationService)
                    .clearSensitiveMetadata(session);

            ResponseEntity<byte[]> response = controller.finalizeSession(SESSION_ID, principal);

            // The inner cleanup failure throws ResponseStatusException, which the outer
            // try/catch converts into a plain 500.
            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
        }
    }

    // ===================================================================
    // getSignedPdf
    // ===================================================================

    @Nested
    @DisplayName("getSignedPdf")
    class GetSignedPdf {

        @Test
        @DisplayName("returns 401 when principal is null")
        void unauthorizedWhenNoPrincipal() {
            ResponseEntity<byte[]> response = controller.getSignedPdf(SESSION_ID, null);

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
        }

        @Test
        @DisplayName("returns 404 when no processed file exists")
        void notFoundWhenNull() throws Exception {
            stubCurrentUser();
            when(workflowSessionService.getProcessedFile(SESSION_ID, owner)).thenReturn(null);

            ResponseEntity<byte[]> response = controller.getSignedPdf(SESSION_ID, principal);

            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("returns 200 with signed PDF when available")
        void okWithSignedPdf() throws Exception {
            byte[] signed = new byte[] {4, 5, 6};
            stubCurrentUser();
            when(workflowSessionService.getProcessedFile(SESSION_ID, owner)).thenReturn(signed);
            when(workflowSessionService.getSessionForOwner(SESSION_ID, owner))
                    .thenReturn(newSession());

            ResponseEntity<byte[]> response = controller.getSignedPdf(SESSION_ID, principal);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals(signed, response.getBody());
        }

        @Test
        @DisplayName("returns 403 when retrieval throws")
        void forbiddenOnFailure() throws Exception {
            stubCurrentUser();
            when(workflowSessionService.getProcessedFile(SESSION_ID, owner))
                    .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "denied"));

            ResponseEntity<byte[]> response = controller.getSignedPdf(SESSION_ID, principal);

            assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        }
    }

    // ===================================================================
    // listSignRequests
    // ===================================================================

    @Nested
    @DisplayName("listSignRequests")
    class ListSignRequests {

        @Test
        @DisplayName("returns 401 when principal is null")
        void unauthorizedWhenNoPrincipal() {
            ResponseEntity<?> response = controller.listSignRequests(null);

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
        }

        @Test
        @DisplayName("returns 200 with sign request summaries")
        void okWithSummaries() {
            stubCurrentUser();
            when(workflowSessionService.listSignRequests(owner)).thenReturn(List.of());

            ResponseEntity<?> response = controller.listSignRequests(principal);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("returns 500 with reason when listing fails")
        void internalServerErrorOnFailure() {
            stubCurrentUser();
            when(workflowSessionService.listSignRequests(owner))
                    .thenThrow(new RuntimeException("boom"));

            ResponseEntity<?> response = controller.listSignRequests(principal);

            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
            assertEquals("Cannot list sign requests: boom", response.getBody());
        }
    }

    // ===================================================================
    // getSignRequestDetail
    // ===================================================================

    @Nested
    @DisplayName("getSignRequestDetail")
    class GetSignRequestDetail {

        @Test
        @DisplayName("returns 401 when principal is null")
        void unauthorizedWhenNoPrincipal() {
            ResponseEntity<?> response = controller.getSignRequestDetail(SESSION_ID, null);

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
        }

        @Test
        @DisplayName("returns 200 with detail on success")
        void okWithDetail() {
            stubCurrentUser();
            stirling.software.proprietary.workflow.dto.SignRequestDetailDTO detail =
                    new stirling.software.proprietary.workflow.dto.SignRequestDetailDTO();
            when(workflowSessionService.getSignRequestDetail(SESSION_ID, owner)).thenReturn(detail);

            ResponseEntity<?> response = controller.getSignRequestDetail(SESSION_ID, principal);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals(detail, response.getBody());
        }

        @Test
        @DisplayName("returns 403 with reason when access denied")
        void forbiddenOnFailure() {
            stubCurrentUser();
            when(workflowSessionService.getSignRequestDetail(SESSION_ID, owner))
                    .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "denied"));

            ResponseEntity<?> response = controller.getSignRequestDetail(SESSION_ID, principal);

            assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        }
    }

    // ===================================================================
    // getSignRequestDocument
    // ===================================================================

    @Nested
    @DisplayName("getSignRequestDocument")
    class GetSignRequestDocument {

        @Test
        @DisplayName("returns 401 when principal is null")
        void unauthorizedWhenNoPrincipal() {
            ResponseEntity<byte[]> response = controller.getSignRequestDocument(SESSION_ID, null);

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
        }

        @Test
        @DisplayName("returns 200 with document bytes on success")
        void okWithDocument() {
            byte[] doc = new byte[] {1, 1, 1};
            stubCurrentUser();
            when(workflowSessionService.getSignRequestDocument(SESSION_ID, owner)).thenReturn(doc);

            ResponseEntity<byte[]> response =
                    controller.getSignRequestDocument(SESSION_ID, principal);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals(doc, response.getBody());
        }

        @Test
        @DisplayName("returns 403 when retrieval throws")
        void forbiddenOnFailure() {
            stubCurrentUser();
            when(workflowSessionService.getSignRequestDocument(SESSION_ID, owner))
                    .thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND, "missing"));

            ResponseEntity<byte[]> response =
                    controller.getSignRequestDocument(SESSION_ID, principal);

            assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        }
    }

    // ===================================================================
    // signDocument
    // ===================================================================

    @Nested
    @DisplayName("signDocument")
    class SignDocument {

        @Test
        @DisplayName("returns 401 when principal is null")
        void unauthorizedWhenNoPrincipal() {
            SignDocumentRequest request = new SignDocumentRequest();

            ResponseEntity<?> response = controller.signDocument(SESSION_ID, request, null);

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
            verify(workflowSessionService, never()).signDocument(any(), any(), any());
        }

        @Test
        @DisplayName("returns 204 on successful sign")
        void noContentOnSuccess() {
            SignDocumentRequest request = new SignDocumentRequest();
            stubCurrentUser();
            doNothing().when(workflowSessionService).signDocument(SESSION_ID, owner, request);

            ResponseEntity<?> response = controller.signDocument(SESSION_ID, request, principal);

            assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
            verify(workflowSessionService).signDocument(SESSION_ID, owner, request);
        }

        @Test
        @DisplayName("returns 400 with message on IllegalArgumentException")
        void badRequestOnIllegalArgument() {
            SignDocumentRequest request = new SignDocumentRequest();
            stubCurrentUser();
            doThrow(new IllegalArgumentException("bad cert"))
                    .when(workflowSessionService)
                    .signDocument(SESSION_ID, owner, request);

            ResponseEntity<?> response = controller.signDocument(SESSION_ID, request, principal);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("bad cert", response.getBody());
        }

        @Test
        @DisplayName("returns 500 with reason on generic failure")
        void internalServerErrorOnGenericFailure() {
            SignDocumentRequest request = new SignDocumentRequest();
            stubCurrentUser();
            doThrow(new RuntimeException("storage failure"))
                    .when(workflowSessionService)
                    .signDocument(SESSION_ID, owner, request);

            ResponseEntity<?> response = controller.signDocument(SESSION_ID, request, principal);

            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
            assertEquals("Cannot sign document: storage failure", response.getBody());
        }
    }

    // ===================================================================
    // declineSignRequest
    // ===================================================================

    @Nested
    @DisplayName("declineSignRequest")
    class DeclineSignRequest {

        @Test
        @DisplayName("returns 401 when principal is null")
        void unauthorizedWhenNoPrincipal() {
            ResponseEntity<?> response = controller.declineSignRequest(SESSION_ID, null);

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
            verify(workflowSessionService, never()).declineSignRequest(any(), any());
        }

        @Test
        @DisplayName("returns 204 on successful decline")
        void noContentOnSuccess() {
            stubCurrentUser();
            doNothing().when(workflowSessionService).declineSignRequest(SESSION_ID, owner);

            ResponseEntity<?> response = controller.declineSignRequest(SESSION_ID, principal);

            assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
            verify(workflowSessionService).declineSignRequest(SESSION_ID, owner);
        }

        @Test
        @DisplayName("returns 403 with reason when decline fails")
        void forbiddenOnFailure() {
            stubCurrentUser();
            doThrow(new IllegalStateException("already signed"))
                    .when(workflowSessionService)
                    .declineSignRequest(SESSION_ID, owner);

            ResponseEntity<?> response = controller.declineSignRequest(SESSION_ID, principal);

            assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
            assertEquals("Cannot decline sign request: already signed", response.getBody());
        }
    }

    // ===================================================================
    // validateCertificate
    // ===================================================================

    @Nested
    @DisplayName("validateCertificate")
    class ValidateCertificate {

        @Test
        @DisplayName("returns 401 when principal is null")
        void unauthorizedWhenNoPrincipal() {
            ResponseEntity<CertificateValidationResponse> response =
                    controller.validateCertificate("PKCS12", "pw", null, null, null);

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
        }

        @Test
        @DisplayName("throws 400 when no file provided for an upload cert type")
        void badRequestWhenNoFile() {
            ResponseStatusException ex =
                    assertThrows(
                            ResponseStatusException.class,
                            () ->
                                    controller.validateCertificate(
                                            "PKCS12", "pw", null, null, principal));

            assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        }

        @Test
        @DisplayName(
                "returns valid response for SERVER cert type (no file, validator returns null)")
        void serverCertReturnsValidWithoutInfo() {
            when(certificateSubmissionValidator.validateAndExtractInfo(any(), eq("SERVER"), any()))
                    .thenReturn(null);

            ResponseEntity<CertificateValidationResponse> response =
                    controller.validateCertificate("SERVER", null, null, null, principal);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            CertificateValidationResponse body = response.getBody();
            assertNotNull(body);
            assertTrue(body.valid());
            assertNull(body.subjectName());
            assertNull(body.error());
        }

        @Test
        @DisplayName("returns populated valid response with cert info from p12 upload")
        void validWithCertInfo() throws Exception {
            MultipartFile p12 = org.mockito.Mockito.mock(MultipartFile.class);
            when(p12.isEmpty()).thenReturn(false);
            when(p12.getBytes()).thenReturn(new byte[] {1, 2, 3});

            Date notBefore = new Date(1_000_000_000_000L);
            Date notAfter = new Date(2_000_000_000_000L);
            CertificateInfo info =
                    new CertificateInfo("CN=Alice", "CN=CA", notBefore, notAfter, true);
            when(certificateSubmissionValidator.validateAndExtractInfo(
                            any(byte[].class), eq("PKCS12"), eq("pw")))
                    .thenReturn(info);

            ResponseEntity<CertificateValidationResponse> response =
                    controller.validateCertificate("PKCS12", "pw", p12, null, principal);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            CertificateValidationResponse body = response.getBody();
            assertNotNull(body);
            assertTrue(body.valid());
            assertEquals("CN=Alice", body.subjectName());
            assertEquals("CN=CA", body.issuerName());
            assertTrue(body.selfSigned());
            assertEquals(notAfter.toInstant().toString(), body.notAfter());
            assertEquals(notBefore.toInstant().toString(), body.notBefore());
            assertNull(body.error());
        }

        @Test
        @DisplayName("reads jks file when provided and p12 is absent")
        void usesJksFileWhenP12Absent() throws Exception {
            MultipartFile jks = org.mockito.Mockito.mock(MultipartFile.class);
            when(jks.isEmpty()).thenReturn(false);
            when(jks.getBytes()).thenReturn(new byte[] {9});
            when(certificateSubmissionValidator.validateAndExtractInfo(
                            any(byte[].class), eq("JKS"), any()))
                    .thenReturn(null);

            ResponseEntity<CertificateValidationResponse> response =
                    controller.validateCertificate("JKS", null, null, jks, principal);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertTrue(response.getBody().valid());
            verify(jks).getBytes();
        }

        @Test
        @DisplayName("returns invalid response with reason when validator throws 400")
        void invalidWhenValidatorThrows() throws Exception {
            MultipartFile p12 = org.mockito.Mockito.mock(MultipartFile.class);
            when(p12.isEmpty()).thenReturn(false);
            when(p12.getBytes()).thenReturn(new byte[] {1});
            when(certificateSubmissionValidator.validateAndExtractInfo(
                            any(byte[].class), eq("PKCS12"), any()))
                    .thenThrow(
                            new ResponseStatusException(
                                    HttpStatus.BAD_REQUEST, "Certificate has expired"));

            ResponseEntity<CertificateValidationResponse> response =
                    controller.validateCertificate("PKCS12", "pw", p12, null, principal);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            CertificateValidationResponse body = response.getBody();
            assertNotNull(body);
            assertEquals(false, body.valid());
            assertEquals("Certificate has expired", body.error());
        }

        @Test
        @DisplayName("returns invalid response when file read throws IOException")
        void invalidWhenFileReadFails() throws Exception {
            MultipartFile p12 = org.mockito.Mockito.mock(MultipartFile.class);
            when(p12.isEmpty()).thenReturn(false);
            when(p12.getBytes()).thenThrow(new IOException("read error"));

            ResponseEntity<CertificateValidationResponse> response =
                    controller.validateCertificate("PKCS12", "pw", p12, null, principal);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            CertificateValidationResponse body = response.getBody();
            assertNotNull(body);
            assertEquals(false, body.valid());
            assertEquals("Failed to read certificate file", body.error());
        }
    }

    // ===================================================================
    // getCurrentUser (exercised via a handler) — unknown user -> 401 path
    // ===================================================================

    @Nested
    @DisplayName("current user resolution")
    class CurrentUserResolution {

        @Test
        @DisplayName("listSessions surfaces unauthorized when username is unknown (500 wrapper)")
        void unknownUserIsWrappedAsServerError() {
            // getCurrentUser throws ResponseStatusException(401); listSessions' generic
            // catch converts it into a 500 with a fixed body.
            when(userService.findByUsernameIgnoreCase(USERNAME)).thenReturn(Optional.empty());

            ResponseEntity<?> response = controller.listSessions(principal);

            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
            assertEquals("Error listing sessions", response.getBody());
        }

        @Test
        @DisplayName("getSessionPdf returns 403 when username is unknown")
        void unknownUserOnPdfReturns403() {
            when(userService.findByUsernameIgnoreCase(USERNAME)).thenReturn(Optional.empty());

            ResponseEntity<byte[]> response = controller.getSessionPdf(SESSION_ID, principal);

            assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        }
    }
}
