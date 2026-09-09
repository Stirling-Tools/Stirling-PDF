package stirling.software.proprietary.workflow.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.workflow.dto.ParticipantResponse;
import stirling.software.proprietary.workflow.dto.SignatureSubmissionRequest;
import stirling.software.proprietary.workflow.dto.WorkflowSessionResponse;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.model.WorkflowStatus;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;
import stirling.software.proprietary.workflow.service.CertificateSubmissionValidator;
import stirling.software.proprietary.workflow.service.MetadataEncryptionService;
import stirling.software.proprietary.workflow.service.WorkflowSessionService;

import tools.jackson.databind.ObjectMapper;

// Covers the participant-facing token endpoints not in WorkflowParticipantValidateCertificateTest.
@ExtendWith(MockitoExtension.class)
class WorkflowParticipantControllerMoreTest {

    @Mock private WorkflowSessionService workflowSessionService;
    @Mock private WorkflowParticipantRepository participantRepository;
    @Mock private MetadataEncryptionService metadataEncryptionService;
    @Mock private CertificateSubmissionValidator certificateSubmissionValidator;

    private WorkflowParticipantController controller;

    private static final String TOKEN = "share-token-abc";

    @BeforeEach
    void setUp() {
        controller =
                new WorkflowParticipantController(
                        workflowSessionService,
                        participantRepository,
                        new ObjectMapper(),
                        metadataEncryptionService,
                        certificateSubmissionValidator);
    }

    private WorkflowSession activeSession() {
        User owner = new User();
        owner.setId(1L);
        owner.setUsername("owner");
        WorkflowSession s = new WorkflowSession();
        s.setSessionId("s1");
        s.setOwner(owner);
        s.setDocumentName("doc.pdf");
        s.setStatus(WorkflowStatus.IN_PROGRESS);
        s.setParticipants(new ArrayList<>());
        return s;
    }

    private WorkflowParticipant participant(ParticipantStatus status) {
        WorkflowParticipant p = new WorkflowParticipant();
        p.setId(5L);
        p.setEmail("p@example.com");
        p.setStatus(status);
        p.setAccessRole(ShareAccessRole.EDITOR);
        WorkflowSession s = activeSession();
        s.addParticipant(p);
        return p;
    }

    // -------------------------------------------------------------------------
    // getSessionByToken
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("getSessionByToken")
    class GetSessionByToken {

        @Test
        void invalidToken_throwsForbidden() {
            when(participantRepository.findByShareToken("bad")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> controller.getSessionByToken("bad"))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.FORBIDDEN);
        }

        @Test
        void pendingParticipant_marksViewedAndReturnsSession() {
            WorkflowParticipant p = participant(ParticipantStatus.PENDING);
            when(participantRepository.findByShareToken(TOKEN)).thenReturn(Optional.of(p));

            ResponseEntity<WorkflowSessionResponse> response = controller.getSessionByToken(TOKEN);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(workflowSessionService).updateParticipantStatus(5L, ParticipantStatus.VIEWED);
        }

        @Test
        void expiredParticipant_throwsForbidden() {
            WorkflowParticipant p = participant(ParticipantStatus.PENDING);
            p.setExpiresAt(java.time.LocalDateTime.now().minusDays(1));
            when(participantRepository.findByShareToken(TOKEN)).thenReturn(Optional.of(p));

            assertThatThrownBy(() -> controller.getSessionByToken(TOKEN))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.FORBIDDEN);
        }

        @Test
        void signedParticipant_doesNotUpdateStatus() {
            WorkflowParticipant p = participant(ParticipantStatus.SIGNED);
            when(participantRepository.findByShareToken(TOKEN)).thenReturn(Optional.of(p));

            controller.getSessionByToken(TOKEN);

            verify(workflowSessionService, org.mockito.Mockito.never())
                    .updateParticipantStatus(
                            org.mockito.ArgumentMatchers.anyLong(),
                            org.mockito.ArgumentMatchers.any());
        }
    }

    // -------------------------------------------------------------------------
    // getParticipantDetails
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("getParticipantDetails returns participant response")
    void getParticipantDetails_returnsResponse() {
        WorkflowParticipant p = participant(ParticipantStatus.VIEWED);
        when(participantRepository.findByShareToken(TOKEN)).thenReturn(Optional.of(p));

        ResponseEntity<ParticipantResponse> response = controller.getParticipantDetails(TOKEN);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().getEmail()).isEqualTo("p@example.com");
    }

    @Test
    @DisplayName("getParticipantDetails invalid token throws 403")
    void getParticipantDetails_invalidToken() {
        when(participantRepository.findByShareToken("bad")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller.getParticipantDetails("bad"))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    // -------------------------------------------------------------------------
    // submitSignature
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("submitSignature")
    class SubmitSignature {

        private SignatureSubmissionRequest request(String token) {
            SignatureSubmissionRequest r = new SignatureSubmissionRequest();
            r.setParticipantToken(token);
            r.setCertType("SERVER");
            return r;
        }

        @Test
        void blankToken_throwsBadRequest() {
            SignatureSubmissionRequest r = new SignatureSubmissionRequest();
            r.setParticipantToken("  ");

            assertThatThrownBy(() -> controller.submitSignature(r))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        void invalidToken_throwsForbidden() {
            when(participantRepository.findByShareToken("bad")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> controller.submitSignature(request("bad")))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.FORBIDDEN);
        }

        @Test
        void alreadyCompleted_throwsBadRequest() {
            WorkflowParticipant p = participant(ParticipantStatus.SIGNED);
            when(participantRepository.findByShareToken(TOKEN)).thenReturn(Optional.of(p));

            assertThatThrownBy(() -> controller.submitSignature(request(TOKEN)))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        void inactiveSession_throwsBadRequest() {
            WorkflowParticipant p = participant(ParticipantStatus.PENDING);
            p.getWorkflowSession().setFinalized(true); // isActive() false
            when(participantRepository.findByShareToken(TOKEN)).thenReturn(Optional.of(p));

            assertThatThrownBy(() -> controller.submitSignature(request(TOKEN)))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        void serverCert_savesParticipantSigned() {
            WorkflowParticipant p = participant(ParticipantStatus.PENDING);
            when(participantRepository.findByShareToken(TOKEN)).thenReturn(Optional.of(p));
            when(metadataEncryptionService.encrypt(org.mockito.ArgumentMatchers.any()))
                    .thenReturn("enc");
            when(participantRepository.save(org.mockito.ArgumentMatchers.any()))
                    .thenAnswer(i -> i.getArgument(0));

            ResponseEntity<ParticipantResponse> response =
                    controller.submitSignature(request(TOKEN));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(p.getStatus()).isEqualTo(ParticipantStatus.SIGNED);
        }
    }

    // -------------------------------------------------------------------------
    // declineParticipation
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("declineParticipation")
    class DeclineParticipation {

        @Test
        void invalidToken_throwsForbidden() {
            when(participantRepository.findByShareToken("bad")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> controller.declineParticipation("bad", null))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.FORBIDDEN);
        }

        @Test
        void alreadyCompleted_throwsBadRequest() {
            WorkflowParticipant p = participant(ParticipantStatus.DECLINED);
            when(participantRepository.findByShareToken(TOKEN)).thenReturn(Optional.of(p));

            assertThatThrownBy(() -> controller.declineParticipation(TOKEN, null))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        void withReason_setsDeclinedAndNotifies() {
            WorkflowParticipant p = participant(ParticipantStatus.PENDING);
            when(participantRepository.findByShareToken(TOKEN)).thenReturn(Optional.of(p));
            when(participantRepository.save(org.mockito.ArgumentMatchers.any()))
                    .thenAnswer(i -> i.getArgument(0));

            ResponseEntity<ParticipantResponse> response =
                    controller.declineParticipation(TOKEN, "not me");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(p.getStatus()).isEqualTo(ParticipantStatus.DECLINED);
            verify(workflowSessionService).addParticipantNotification(5L, "Declined: not me");
        }

        @Test
        void withoutReason_usesDefaultNotification() {
            WorkflowParticipant p = participant(ParticipantStatus.PENDING);
            when(participantRepository.findByShareToken(TOKEN)).thenReturn(Optional.of(p));
            when(participantRepository.save(org.mockito.ArgumentMatchers.any()))
                    .thenAnswer(i -> i.getArgument(0));

            controller.declineParticipation(TOKEN, null);

            verify(workflowSessionService).addParticipantNotification(5L, "Declined participation");
        }
    }

    // -------------------------------------------------------------------------
    // getDocument
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("getDocument")
    class GetDocument {

        @Test
        void invalidToken_throwsForbidden() {
            when(participantRepository.findByShareToken("bad")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> controller.getDocument("bad"))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.FORBIDDEN);
        }

        @Test
        void expiredParticipant_throwsForbidden() {
            WorkflowParticipant p = participant(ParticipantStatus.PENDING);
            p.setExpiresAt(java.time.LocalDateTime.now().minusDays(1));
            when(participantRepository.findByShareToken(TOKEN)).thenReturn(Optional.of(p));

            assertThatThrownBy(() -> controller.getDocument(TOKEN))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.FORBIDDEN);
        }

        @Test
        void validParticipant_returnsPdf() throws Exception {
            WorkflowParticipant p = participant(ParticipantStatus.PENDING);
            when(participantRepository.findByShareToken(TOKEN)).thenReturn(Optional.of(p));
            when(workflowSessionService.getOriginalFile("s1")).thenReturn(new byte[] {1, 2, 3});

            ResponseEntity<byte[]> response = controller.getDocument(TOKEN);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).containsExactly(1, 2, 3);
        }
    }
}
