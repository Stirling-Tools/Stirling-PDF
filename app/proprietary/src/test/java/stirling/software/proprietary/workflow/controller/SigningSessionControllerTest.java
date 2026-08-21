package stirling.software.proprietary.workflow.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.security.Principal;
import java.util.ArrayList;
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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.workflow.dto.CertificateInfo;
import stirling.software.proprietary.workflow.dto.WorkflowCreationRequest;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.service.CertificateSubmissionValidator;
import stirling.software.proprietary.workflow.service.SigningFinalizationService;
import stirling.software.proprietary.workflow.service.WorkflowSessionService;

// Direct handler invocations (no MockMvc) for SigningSessionController; previously 0% covered.
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SigningSessionControllerTest {

    @Mock private WorkflowSessionService workflowSessionService;
    @Mock private UserService userService;
    @Mock private SigningFinalizationService signingFinalizationService;
    @Mock private CertificateSubmissionValidator certificateSubmissionValidator;

    private SigningSessionController controller;

    @BeforeEach
    void setUp() {
        controller =
                new SigningSessionController(
                        workflowSessionService,
                        userService,
                        signingFinalizationService,
                        certificateSubmissionValidator);
    }

    private Principal principal(String name) {
        return () -> name;
    }

    private User user(String username) {
        User u = new User();
        u.setId(1L);
        u.setUsername(username);
        return u;
    }

    private WorkflowSession ownedSession(String id, User owner) {
        WorkflowSession s = new WorkflowSession();
        s.setSessionId(id);
        s.setOwner(owner);
        s.setDocumentName("doc.pdf");
        s.setParticipants(new ArrayList<>());
        return s;
    }

    // -------------------------------------------------------------------------
    // Unauthenticated (null principal) branches
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("null principal returns 401")
    class NullPrincipal {

        @Test
        void listSessions_unauthenticated() {
            assertThat(controller.listSessions(null).getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }

        @Test
        void getSession_unauthenticated() {
            assertThat(controller.getSession("s1", null).getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }

        @Test
        void deleteSession_unauthenticated() {
            assertThat(controller.deleteSession("s1", null).getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }

        @Test
        void addParticipants_unauthenticated() {
            assertThat(controller.addParticipants("s1", List.of(), null).getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }

        @Test
        void getSessionPdf_unauthenticated() {
            assertThat(controller.getSessionPdf("s1", null).getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }

        @Test
        void listSignRequests_unauthenticated() {
            assertThat(controller.listSignRequests(null).getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }

        @Test
        void validateCertificate_unauthenticated() {
            assertThat(
                            controller
                                    .validateCertificate("P12", "pw", null, null, null)
                                    .getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }
    }

    // -------------------------------------------------------------------------
    // listSessions
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("listSessions returns mapped responses")
    void listSessions_returnsResponses() {
        User owner = user("alice");
        when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(owner));
        when(workflowSessionService.listUserSessions(owner))
                .thenReturn(List.of(ownedSession("s1", owner)));

        ResponseEntity<?> response = controller.listSessions(principal("alice"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((List<?>) response.getBody()).hasSize(1);
    }

    @Test
    @DisplayName("listSessions wraps service error as 500")
    void listSessions_serviceError_returns500() {
        when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(user("alice")));
        when(workflowSessionService.listUserSessions(any()))
                .thenThrow(new RuntimeException("db down"));

        ResponseEntity<?> response = controller.listSessions(principal("alice"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // -------------------------------------------------------------------------
    // createSession
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("createSession")
    class CreateSession {

        @Test
        void unauthenticated_returns401() throws Exception {
            MultipartFile file = mock(MultipartFile.class);
            assertThat(
                            controller
                                    .createSession(file, new WorkflowCreationRequest(), null)
                                    .getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }

        @Test
        void success_returnsOk() throws Exception {
            User owner = user("alice");
            MultipartFile file =
                    new MockMultipartFile("file", "d.pdf", "application/pdf", new byte[] {1});
            WorkflowCreationRequest request = new WorkflowCreationRequest();
            WorkflowSession session = ownedSession("s1", owner);
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(owner));
            when(workflowSessionService.createSession(eq(owner), eq(file), eq(request)))
                    .thenReturn(session);

            ResponseEntity<?> response =
                    controller.createSession(file, request, principal("alice"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        }

        @Test
        void serviceError_returns400() throws Exception {
            User owner = user("alice");
            MultipartFile file =
                    new MockMultipartFile("file", "d.pdf", "application/pdf", new byte[] {1});
            WorkflowCreationRequest request = new WorkflowCreationRequest();
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(owner));
            when(workflowSessionService.createSession(any(), any(), any()))
                    .thenThrow(new RuntimeException("bad"));

            ResponseEntity<?> response =
                    controller.createSession(file, request, principal("alice"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        }
    }

    // -------------------------------------------------------------------------
    // getSession
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("getSession")
    class GetSession {

        @Test
        void found_returnsOk() {
            User owner = user("alice");
            WorkflowSession session = ownedSession("s1", owner);
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(owner));
            when(workflowSessionService.getSessionForOwner("s1", owner)).thenReturn(session);

            ResponseEntity<?> response = controller.getSession("s1", principal("alice"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        }

        @Test
        void serviceThrows_returnsForbidden() {
            User owner = user("alice");
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(owner));
            when(workflowSessionService.getSessionForOwner("s1", owner))
                    .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "nope"));

            ResponseEntity<?> response = controller.getSession("s1", principal("alice"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        }
    }

    // -------------------------------------------------------------------------
    // deleteSession
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("deleteSession")
    class DeleteSession {

        @Test
        void success_returns204() {
            User owner = user("alice");
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(owner));

            ResponseEntity<?> response = controller.deleteSession("s1", principal("alice"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
            verify(workflowSessionService).deleteSession("s1", owner);
        }

        @Test
        void serviceThrows_returnsForbidden() {
            User owner = user("alice");
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(owner));
            doThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "finalized"))
                    .when(workflowSessionService)
                    .deleteSession("s1", owner);

            ResponseEntity<?> response = controller.deleteSession("s1", principal("alice"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        }
    }

    // -------------------------------------------------------------------------
    // addParticipants / removeParticipant
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("addParticipants returns updated session")
    void addParticipants_returnsOk() {
        User owner = user("alice");
        WorkflowSession session = ownedSession("s1", owner);
        when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(owner));
        when(workflowSessionService.getSessionWithParticipantsForOwner("s1", owner))
                .thenReturn(session);

        ResponseEntity<?> response =
                controller.addParticipants("s1", List.of(), principal("alice"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(workflowSessionService).addParticipants(eq("s1"), any(), eq(owner));
    }

    @Test
    @DisplayName("removeParticipant returns 204")
    void removeParticipant_returns204() {
        User owner = user("alice");
        when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(owner));

        ResponseEntity<?> response = controller.removeParticipant("s1", 5L, principal("alice"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verify(workflowSessionService).removeParticipant("s1", 5L, owner);
    }

    @Test
    @DisplayName("removeParticipant unauthenticated returns 401")
    void removeParticipant_unauthenticated() {
        assertThat(controller.removeParticipant("s1", 5L, null).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @DisplayName("removeParticipant service error returns 403")
    void removeParticipant_serviceError() {
        User owner = user("alice");
        when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(owner));
        doThrow(new ResponseStatusException(HttpStatus.NOT_FOUND, "x"))
                .when(workflowSessionService)
                .removeParticipant("s1", 5L, owner);

        assertThat(controller.removeParticipant("s1", 5L, principal("alice")).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    // -------------------------------------------------------------------------
    // getSessionPdf
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("getSessionPdf returns PDF bytes")
    void getSessionPdf_returnsBytes() throws Exception {
        User owner = user("alice");
        WorkflowSession session = ownedSession("s1", owner);
        when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(owner));
        when(workflowSessionService.getSessionForOwner("s1", owner)).thenReturn(session);
        when(workflowSessionService.getOriginalFile("s1")).thenReturn(new byte[] {1, 2});

        ResponseEntity<byte[]> response = controller.getSessionPdf("s1", principal("alice"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).containsExactly(1, 2);
    }

    @Test
    @DisplayName("getSessionPdf service error returns 403")
    void getSessionPdf_serviceError() throws Exception {
        User owner = user("alice");
        when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(owner));
        when(workflowSessionService.getSessionForOwner("s1", owner))
                .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "nope"));

        assertThat(controller.getSessionPdf("s1", principal("alice")).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    // -------------------------------------------------------------------------
    // finalizeSession
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("finalizeSession")
    class FinalizeSession {

        @Test
        void unauthenticated_returns401() throws Exception {
            assertThat(controller.finalizeSession("s1", null).getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }

        @Test
        void success_returnsSignedPdf() throws Exception {
            User owner = user("alice");
            WorkflowSession session = ownedSession("s1", owner);
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(owner));
            when(workflowSessionService.getSessionWithParticipantsForOwner("s1", owner))
                    .thenReturn(session);
            when(workflowSessionService.getOriginalFile("s1")).thenReturn(new byte[] {1});
            when(signingFinalizationService.finalizeDocument(eq(session), any()))
                    .thenReturn(new byte[] {2, 3});

            ResponseEntity<byte[]> response = controller.finalizeSession("s1", principal("alice"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(workflowSessionService).finalizeSession("s1", owner);
            verify(workflowSessionService).deleteOriginalFile(session);
        }

        @Test
        void serviceError_returns500() throws Exception {
            User owner = user("alice");
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(owner));
            when(workflowSessionService.getSessionWithParticipantsForOwner("s1", owner))
                    .thenThrow(new RuntimeException("boom"));

            assertThat(controller.finalizeSession("s1", principal("alice")).getStatusCode())
                    .isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // -------------------------------------------------------------------------
    // getSignedPdf
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("getSignedPdf")
    class GetSignedPdf {

        @Test
        void unauthenticated_returns401() {
            assertThat(controller.getSignedPdf("s1", null).getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }

        @Test
        void notFinalized_returns404() throws Exception {
            User owner = user("alice");
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(owner));
            when(workflowSessionService.getProcessedFile("s1", owner)).thenReturn(null);

            assertThat(controller.getSignedPdf("s1", principal("alice")).getStatusCode())
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }

        @Test
        void finalized_returnsBytes() throws Exception {
            User owner = user("alice");
            WorkflowSession session = ownedSession("s1", owner);
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(owner));
            when(workflowSessionService.getProcessedFile("s1", owner)).thenReturn(new byte[] {3});
            when(workflowSessionService.getSessionForOwner("s1", owner)).thenReturn(session);

            ResponseEntity<byte[]> response = controller.getSignedPdf("s1", principal("alice"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).containsExactly(3);
        }
    }

    // -------------------------------------------------------------------------
    // listSignRequests / getSignRequestDetail / getSignRequestDocument
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("listSignRequests returns service list")
    void listSignRequests_returnsList() {
        User user = user("alice");
        when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(user));
        when(workflowSessionService.listSignRequests(user)).thenReturn(List.of());

        ResponseEntity<?> response = controller.listSignRequests(principal("alice"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    @DisplayName("getSignRequestDetail returns detail")
    void getSignRequestDetail_returnsOk() {
        User user = user("alice");
        when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(user));
        when(workflowSessionService.getSignRequestDetail("s1", user))
                .thenReturn(new stirling.software.proprietary.workflow.dto.SignRequestDetailDTO());

        ResponseEntity<?> response = controller.getSignRequestDetail("s1", principal("alice"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    @DisplayName("getSignRequestDetail service error returns 403")
    void getSignRequestDetail_serviceError() {
        User user = user("alice");
        when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(user));
        when(workflowSessionService.getSignRequestDetail("s1", user))
                .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "x"));

        assertThat(controller.getSignRequestDetail("s1", principal("alice")).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    @DisplayName("getSignRequestDocument returns bytes")
    void getSignRequestDocument_returnsBytes() {
        User user = user("alice");
        when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(user));
        when(workflowSessionService.getSignRequestDocument("s1", user)).thenReturn(new byte[] {9});

        ResponseEntity<byte[]> response =
                controller.getSignRequestDocument("s1", principal("alice"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    // -------------------------------------------------------------------------
    // signDocument
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("signDocument")
    class SignDocument {

        @Test
        void success_returns204() {
            User user = user("alice");
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(user));
            var request = new stirling.software.proprietary.workflow.dto.SignDocumentRequest();

            ResponseEntity<?> response = controller.signDocument("s1", request, principal("alice"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
            verify(workflowSessionService).signDocument("s1", user, request);
        }

        @Test
        void illegalArgument_returns400() {
            User user = user("alice");
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(user));
            var request = new stirling.software.proprietary.workflow.dto.SignDocumentRequest();
            doThrow(new IllegalArgumentException("bad cert"))
                    .when(workflowSessionService)
                    .signDocument(anyString(), any(), any());

            ResponseEntity<?> response = controller.signDocument("s1", request, principal("alice"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        void unexpectedError_returns500() {
            User user = user("alice");
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(user));
            var request = new stirling.software.proprietary.workflow.dto.SignDocumentRequest();
            doThrow(new RuntimeException("boom"))
                    .when(workflowSessionService)
                    .signDocument(anyString(), any(), any());

            ResponseEntity<?> response = controller.signDocument("s1", request, principal("alice"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // -------------------------------------------------------------------------
    // declineSignRequest
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("declineSignRequest returns 204")
    void declineSignRequest_returns204() {
        User user = user("alice");
        when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(user));

        ResponseEntity<?> response = controller.declineSignRequest("s1", principal("alice"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verify(workflowSessionService).declineSignRequest("s1", user);
    }

    @Test
    @DisplayName("declineSignRequest service error returns 403")
    void declineSignRequest_serviceError() {
        User user = user("alice");
        when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(user));
        doThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "x"))
                .when(workflowSessionService)
                .declineSignRequest("s1", user);

        assertThat(controller.declineSignRequest("s1", principal("alice")).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    // -------------------------------------------------------------------------
    // getCurrentUser (via any authenticated endpoint) — unknown user maps to 401/handler error
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("unknown principal surfaces as handler error response")
    void unknownUser_listSignRequests_returns500() {
        when(userService.findByUsernameIgnoreCase("ghost")).thenReturn(Optional.empty());

        // getCurrentUser throws 401 inside the try, caught and remapped to 500 by listSignRequests
        ResponseEntity<?> response = controller.listSignRequests(principal("ghost"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // -------------------------------------------------------------------------
    // validateCertificate
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("validateCertificate")
    class ValidateCertificate {

        @Test
        void missingFileForP12_throwsBadRequest() {
            User user = user("alice");
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(user));

            org.assertj.core.api.Assertions.assertThatThrownBy(
                            () ->
                                    controller.validateCertificate(
                                            "P12", "pw", null, null, principal("alice")))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        void serverType_returnsValidTrueWithNullInfo() {
            User user = user("alice");
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(user));
            when(certificateSubmissionValidator.validateAndExtractInfo(any(), eq("SERVER"), any()))
                    .thenReturn(null);

            ResponseEntity<?> response =
                    controller.validateCertificate("SERVER", null, null, null, principal("alice"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        }

        @Test
        void validP12_returnsCertInfo() {
            User user = user("alice");
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(user));
            MockMultipartFile p12 =
                    new MockMultipartFile(
                            "p12File", "c.p12", "application/octet-stream", new byte[] {1});
            CertificateInfo info =
                    new CertificateInfo(
                            "Signer", "CA", new java.util.Date(), new java.util.Date(), true);
            when(certificateSubmissionValidator.validateAndExtractInfo(any(), eq("P12"), eq("pw")))
                    .thenReturn(info);

            ResponseEntity<stirling.software.proprietary.workflow.dto.CertificateValidationResponse>
                    response =
                            controller.validateCertificate(
                                    "P12", "pw", p12, null, principal("alice"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody().valid()).isTrue();
            assertThat(response.getBody().subjectName()).isEqualTo("Signer");
        }

        @Test
        void validatorThrows_returnsValidFalse() {
            User user = user("alice");
            when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(user));
            MockMultipartFile p12 =
                    new MockMultipartFile(
                            "p12File", "c.p12", "application/octet-stream", new byte[] {1});
            when(certificateSubmissionValidator.validateAndExtractInfo(any(), any(), any()))
                    .thenThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "bad password"));

            ResponseEntity<stirling.software.proprietary.workflow.dto.CertificateValidationResponse>
                    response =
                            controller.validateCertificate(
                                    "P12", "wrong", p12, null, principal("alice"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody().valid()).isFalse();
            assertThat(response.getBody().error()).isEqualTo("bad password");
        }
    }
}
