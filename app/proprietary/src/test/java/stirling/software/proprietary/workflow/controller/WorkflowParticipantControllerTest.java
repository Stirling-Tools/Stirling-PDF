package stirling.software.proprietary.workflow.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import stirling.software.proprietary.workflow.dto.ParticipantResponse;
import stirling.software.proprietary.workflow.dto.SignatureSubmissionRequest;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.model.WorkflowStatus;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;
import stirling.software.proprietary.workflow.service.MetadataEncryptionService;
import stirling.software.proprietary.workflow.service.WorkflowSessionService;

import tools.jackson.databind.ObjectMapper;

@ExtendWith(MockitoExtension.class)
class WorkflowParticipantControllerTest {

    @Mock private WorkflowSessionService workflowSessionService;
    @Mock private WorkflowParticipantRepository participantRepository;
    @Mock private MetadataEncryptionService metadataEncryptionService;

    private ObjectMapper objectMapper;
    private WorkflowParticipantController controller;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        controller =
                new WorkflowParticipantController(
                        workflowSessionService,
                        participantRepository,
                        objectMapper,
                        metadataEncryptionService);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private WorkflowParticipant guestParticipant(String token, String email) {
        WorkflowSession session = new WorkflowSession();
        session.setStatus(WorkflowStatus.IN_PROGRESS);
        session.setFinalized(false);

        WorkflowParticipant participant = new WorkflowParticipant();
        participant.setId(1L);
        participant.setShareToken(token);
        participant.setEmail(email);
        participant.setUser(null); // guest — no registered user
        participant.setStatus(ParticipantStatus.VIEWED);
        participant.setWorkflowSession(session);
        return participant;
    }

    // ── GUEST_CERT defaulting ─────────────────────────────────────────────

    @Test
    void submitSignature_guestNoCertType_defaultsToGuestCert() throws Exception {
        String token = "test-token-123";
        WorkflowParticipant participant = guestParticipant(token, "guest@example.com");

        when(participantRepository.findByShareToken(token)).thenReturn(Optional.of(participant));
        when(participantRepository.save(any())).thenReturn(participant);
        // No encrypt() stub — GUEST_CERT skips encryption entirely (fix verified in separate test)

        SignatureSubmissionRequest request = new SignatureSubmissionRequest();
        request.setParticipantToken(token);
        // certType intentionally not set — should default to GUEST_CERT

        MockHttpServletRequest httpRequest = new MockHttpServletRequest();
        httpRequest.setRemoteAddr("192.168.1.1");
        httpRequest.addHeader("User-Agent", "TestBrowser/1.0");

        ResponseEntity<ParticipantResponse> response =
                controller.submitSignature(request, httpRequest);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);

        // Capture the saved participant and verify certType in metadata
        ArgumentCaptor<WorkflowParticipant> captor =
                ArgumentCaptor.forClass(WorkflowParticipant.class);
        verify(participantRepository).save(captor.capture());

        WorkflowParticipant saved = captor.getValue();
        assertThat(saved.getStatus()).isEqualTo(ParticipantStatus.SIGNED);

        Map<String, Object> metadata = saved.getParticipantMetadata();
        assertThat(metadata).containsKey("certificateSubmission");
        @SuppressWarnings("unchecked")
        Map<String, Object> certSub = (Map<String, Object>) metadata.get("certificateSubmission");
        assertThat(certSub.get("certType")).isEqualTo("GUEST_CERT");
    }

    @Test
    void submitSignature_registeredUserNoCertType_doesNotDefaultToGuestCert() throws Exception {
        String token = "registered-token";
        WorkflowParticipant participant = guestParticipant(token, "user@example.com");

        // Give participant a registered user
        stirling.software.proprietary.security.model.User user =
                new stirling.software.proprietary.security.model.User();
        user.setUsername("registered");
        participant.setUser(user);

        when(participantRepository.findByShareToken(token)).thenReturn(Optional.of(participant));
        when(participantRepository.save(any())).thenReturn(participant);

        SignatureSubmissionRequest request = new SignatureSubmissionRequest();
        request.setParticipantToken(token);
        // certType intentionally not set

        MockHttpServletRequest httpRequest = new MockHttpServletRequest();

        ResponseEntity<ParticipantResponse> response =
                controller.submitSignature(request, httpRequest);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);

        ArgumentCaptor<WorkflowParticipant> captor =
                ArgumentCaptor.forClass(WorkflowParticipant.class);
        verify(participantRepository).save(captor.capture());

        WorkflowParticipant saved = captor.getValue();
        Map<String, Object> metadata = saved.getParticipantMetadata();
        // No certType defaulted — certificateSubmission should be absent
        assertThat(metadata).doesNotContainKey("certificateSubmission");
    }

    // ── Audit trail ───────────────────────────────────────────────────────

    @Test
    void submitSignature_capturesAuditTrail() throws Exception {
        String token = "audit-token";
        WorkflowParticipant participant = guestParticipant(token, "audited@example.com");

        when(participantRepository.findByShareToken(token)).thenReturn(Optional.of(participant));
        when(participantRepository.save(any())).thenReturn(participant);

        SignatureSubmissionRequest request = new SignatureSubmissionRequest();
        request.setParticipantToken(token);

        MockHttpServletRequest httpRequest = new MockHttpServletRequest();
        httpRequest.setRemoteAddr("10.0.0.1");
        httpRequest.addHeader("User-Agent", "AuditBrowser/2.0");

        controller.submitSignature(request, httpRequest);

        ArgumentCaptor<WorkflowParticipant> captor =
                ArgumentCaptor.forClass(WorkflowParticipant.class);
        verify(participantRepository).save(captor.capture());

        Map<String, Object> metadata = captor.getValue().getParticipantMetadata();
        assertThat(metadata).containsKey("auditTrail");

        @SuppressWarnings("unchecked")
        Map<String, Object> audit = (Map<String, Object>) metadata.get("auditTrail");
        assertThat(audit).containsKey("ipHash");
        assertThat(audit).containsKey("userAgent");
        assertThat(audit).containsKey("submittedAt");
        assertThat(audit.get("email")).isEqualTo("audited@example.com");
        // IP should be hashed, not stored raw
        assertThat(audit.get("ipHash")).isNotEqualTo("10.0.0.1");
        assertThat(audit.get("userAgent")).isEqualTo("AuditBrowser/2.0");
    }

    // ── GUEST_CERT password not stored ───────────────────────────────────

    @Test
    void submitSignature_guestCert_doesNotStoreEncryptedPassword() throws Exception {
        String token = "no-pwd-token";
        WorkflowParticipant participant = guestParticipant(token, "guest@example.com");

        when(participantRepository.findByShareToken(token)).thenReturn(Optional.of(participant));
        when(participantRepository.save(any())).thenReturn(participant);

        SignatureSubmissionRequest request = new SignatureSubmissionRequest();
        request.setParticipantToken(token);
        // certType not set → defaults to GUEST_CERT; no password submitted

        MockHttpServletRequest httpRequest = new MockHttpServletRequest();

        controller.submitSignature(request, httpRequest);

        // metadataEncryptionService.encrypt() must NOT be called for GUEST_CERT
        verify(metadataEncryptionService, never()).encrypt(any());

        ArgumentCaptor<WorkflowParticipant> captor =
                ArgumentCaptor.forClass(WorkflowParticipant.class);
        verify(participantRepository).save(captor.capture());

        @SuppressWarnings("unchecked")
        Map<String, Object> certSub =
                (Map<String, Object>)
                        captor.getValue().getParticipantMetadata().get("certificateSubmission");
        assertThat(certSub.get("password")).isNull();
    }

    // ── Audit trail edge cases ────────────────────────────────────────────

    @Test
    void submitSignature_userAgentTruncatedAt500Chars() throws Exception {
        String token = "ua-token";
        WorkflowParticipant participant = guestParticipant(token, "ua@example.com");

        when(participantRepository.findByShareToken(token)).thenReturn(Optional.of(participant));
        when(participantRepository.save(any())).thenReturn(participant);

        SignatureSubmissionRequest request = new SignatureSubmissionRequest();
        request.setParticipantToken(token);

        MockHttpServletRequest httpRequest = new MockHttpServletRequest();
        httpRequest.addHeader("User-Agent", "A".repeat(600));

        controller.submitSignature(request, httpRequest);

        ArgumentCaptor<WorkflowParticipant> captor =
                ArgumentCaptor.forClass(WorkflowParticipant.class);
        verify(participantRepository).save(captor.capture());

        @SuppressWarnings("unchecked")
        Map<String, Object> audit =
                (Map<String, Object>) captor.getValue().getParticipantMetadata().get("auditTrail");
        String storedUa = (String) audit.get("userAgent");
        assertThat(storedUa).hasSize(500);
    }

    @Test
    void submitSignature_nullIp_storesNullHash() throws Exception {
        String token = "null-ip-token";
        WorkflowParticipant participant = guestParticipant(token, "noip@example.com");

        when(participantRepository.findByShareToken(token)).thenReturn(Optional.of(participant));
        when(participantRepository.save(any())).thenReturn(participant);

        SignatureSubmissionRequest request = new SignatureSubmissionRequest();
        request.setParticipantToken(token);

        MockHttpServletRequest httpRequest = new MockHttpServletRequest();
        httpRequest.setRemoteAddr(null);

        controller.submitSignature(request, httpRequest);

        ArgumentCaptor<WorkflowParticipant> captor =
                ArgumentCaptor.forClass(WorkflowParticipant.class);
        verify(participantRepository).save(captor.capture());

        @SuppressWarnings("unchecked")
        Map<String, Object> audit =
                (Map<String, Object>) captor.getValue().getParticipantMetadata().get("auditTrail");
        assertThat(audit.get("ipHash")).isNull();
    }

    // ── Token guards ──────────────────────────────────────────────────────

    @Test
    void submitSignature_expiredToken_returnsForbidden() {
        String token = "expired-token";
        WorkflowParticipant participant = guestParticipant(token, "expired@example.com");
        participant.setExpiresAt(java.time.LocalDateTime.now().minusDays(1)); // expired

        when(participantRepository.findByShareToken(token)).thenReturn(Optional.of(participant));

        SignatureSubmissionRequest request = new SignatureSubmissionRequest();
        request.setParticipantToken(token);

        org.springframework.web.server.ResponseStatusException ex =
                org.junit.jupiter.api.Assertions.assertThrows(
                        org.springframework.web.server.ResponseStatusException.class,
                        () -> controller.submitSignature(request, new MockHttpServletRequest()));

        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void submitSignature_alreadySigned_returnsBadRequest() {
        String token = "signed-token";
        WorkflowParticipant participant = guestParticipant(token, "done@example.com");
        participant.setStatus(ParticipantStatus.SIGNED);

        when(participantRepository.findByShareToken(token)).thenReturn(Optional.of(participant));

        SignatureSubmissionRequest request = new SignatureSubmissionRequest();
        request.setParticipantToken(token);

        org.springframework.web.server.ResponseStatusException ex =
                org.junit.jupiter.api.Assertions.assertThrows(
                        org.springframework.web.server.ResponseStatusException.class,
                        () -> controller.submitSignature(request, new MockHttpServletRequest()));

        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void submitSignature_alreadyDeclined_returnsBadRequest() {
        String token = "declined-token";
        WorkflowParticipant participant = guestParticipant(token, "declined@example.com");
        participant.setStatus(ParticipantStatus.DECLINED);

        when(participantRepository.findByShareToken(token)).thenReturn(Optional.of(participant));

        SignatureSubmissionRequest request = new SignatureSubmissionRequest();
        request.setParticipantToken(token);

        org.springframework.web.server.ResponseStatusException ex =
                org.junit.jupiter.api.Assertions.assertThrows(
                        org.springframework.web.server.ResponseStatusException.class,
                        () -> controller.submitSignature(request, new MockHttpServletRequest()));

        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void submitSignature_unknownToken_returnsForbidden() {
        when(participantRepository.findByShareToken("no-such-token")).thenReturn(Optional.empty());

        SignatureSubmissionRequest request = new SignatureSubmissionRequest();
        request.setParticipantToken("no-such-token");

        org.springframework.web.server.ResponseStatusException ex =
                org.junit.jupiter.api.Assertions.assertThrows(
                        org.springframework.web.server.ResponseStatusException.class,
                        () -> controller.submitSignature(request, new MockHttpServletRequest()));

        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void submitSignature_blankToken_returnsBadRequest() {
        SignatureSubmissionRequest request = new SignatureSubmissionRequest();
        request.setParticipantToken("  ");

        org.springframework.web.server.ResponseStatusException ex =
                org.junit.jupiter.api.Assertions.assertThrows(
                        org.springframework.web.server.ResponseStatusException.class,
                        () -> controller.submitSignature(request, new MockHttpServletRequest()));

        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }
}
