package stirling.software.proprietary.workflow.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.repository.StoredFileRepository;
import stirling.software.proprietary.workflow.dto.SignDocumentRequest;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;
import stirling.software.proprietary.workflow.repository.WorkflowSessionRepository;

import tools.jackson.databind.ObjectMapper;

@ExtendWith(MockitoExtension.class)
class WorkflowSessionServiceTest {

    @Mock private WorkflowSessionRepository workflowSessionRepository;
    @Mock private WorkflowParticipantRepository workflowParticipantRepository;
    @Mock private StoredFileRepository storedFileRepository;
    @Mock private UserRepository userRepository;
    @Mock private StorageProvider storageProvider;
    @Mock private ObjectMapper objectMapper;
    @Mock private ApplicationProperties applicationProperties;
    @Mock private MetadataEncryptionService metadataEncryptionService;

    @InjectMocks private WorkflowSessionService service;

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private WorkflowSession sessionWithParticipant(
            String sessionId, WorkflowParticipant participant) {
        WorkflowSession session = new WorkflowSession();
        session.setSessionId(sessionId);
        List<WorkflowParticipant> participants = new ArrayList<>();
        participants.add(participant);
        session.setParticipants(participants);
        when(workflowSessionRepository.findBySessionId(sessionId)).thenReturn(Optional.of(session));
        return session;
    }

    private WorkflowParticipant pendingParticipant(User user) {
        WorkflowParticipant p = new WorkflowParticipant();
        p.setUser(user);
        p.setStatus(ParticipantStatus.PENDING);
        return p;
    }

    private User user(String username) {
        User u = new User();
        u.setUsername(username);
        return u;
    }

    // -------------------------------------------------------------------------
    // signDocument — status transition
    // -------------------------------------------------------------------------

    @Test
    void signDocument_transitionsParticipantToSigned() {
        User user = user("alice");
        WorkflowParticipant participant = pendingParticipant(user);
        sessionWithParticipant("s1", participant);

        when(metadataEncryptionService.encrypt(any())).thenReturn("enc:pw");
        when(workflowParticipantRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        SignDocumentRequest req = new SignDocumentRequest();
        req.setCertType("SERVER");

        service.signDocument("s1", user, req);

        ArgumentCaptor<WorkflowParticipant> captor =
                ArgumentCaptor.forClass(WorkflowParticipant.class);
        verify(workflowParticipantRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(ParticipantStatus.SIGNED);
    }

    // -------------------------------------------------------------------------
    // signDocument — certificate metadata
    // -------------------------------------------------------------------------

    @Test
    void signDocument_storesCertTypeAndEncryptedPasswordInMetadata() {
        User user = user("bob");
        WorkflowParticipant participant = pendingParticipant(user);
        sessionWithParticipant("s2", participant);

        when(metadataEncryptionService.encrypt("secret")).thenReturn("enc:secret");
        when(workflowParticipantRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        SignDocumentRequest req = new SignDocumentRequest();
        req.setCertType("USER_CERT");
        req.setPassword("secret");

        service.signDocument("s2", user, req);

        ArgumentCaptor<WorkflowParticipant> captor =
                ArgumentCaptor.forClass(WorkflowParticipant.class);
        verify(workflowParticipantRepository).save(captor.capture());

        Map<String, Object> meta = captor.getValue().getParticipantMetadata();
        assertThat(meta).containsKey("certificateSubmission");

        @SuppressWarnings("unchecked")
        Map<String, Object> cert = (Map<String, Object>) meta.get("certificateSubmission");
        assertThat(cert.get("certType")).isEqualTo("USER_CERT");
        // Raw password must not be stored — only the encrypted form
        assertThat(cert.get("password")).isEqualTo("enc:secret");
        assertThat(cert.get("password")).isNotEqualTo("secret");
    }

    @Test
    void signDocument_preservesExistingParticipantMetadata() {
        User user = user("carol");
        WorkflowParticipant participant = pendingParticipant(user);
        Map<String, Object> existing = new HashMap<>();
        existing.put("showLogo", true);
        existing.put("pageNumber", 1);
        participant.setParticipantMetadata(existing);
        sessionWithParticipant("s3", participant);

        when(metadataEncryptionService.encrypt(any())).thenReturn("enc:pw");
        when(workflowParticipantRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        SignDocumentRequest req = new SignDocumentRequest();
        req.setCertType("SERVER");

        service.signDocument("s3", user, req);

        ArgumentCaptor<WorkflowParticipant> captor =
                ArgumentCaptor.forClass(WorkflowParticipant.class);
        verify(workflowParticipantRepository).save(captor.capture());

        Map<String, Object> meta = captor.getValue().getParticipantMetadata();
        // Owner-configured appearance settings must survive the sign operation
        assertThat(meta.get("showLogo")).isEqualTo(true);
        assertThat(meta.get("pageNumber")).isEqualTo(1);
        assertThat(meta).containsKey("certificateSubmission");
    }

    // -------------------------------------------------------------------------
    // signDocument — guard conditions
    // -------------------------------------------------------------------------

    @Test
    void signDocument_throwsBadRequest_whenAlreadySigned() {
        User user = user("dave");
        WorkflowParticipant participant = pendingParticipant(user);
        participant.setStatus(ParticipantStatus.SIGNED);
        sessionWithParticipant("s4", participant);

        SignDocumentRequest req = new SignDocumentRequest();
        req.setCertType("SERVER");

        assertThatThrownBy(() -> service.signDocument("s4", user, req))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        verify(workflowParticipantRepository, never()).save(any());
    }

    @Test
    void signDocument_throwsBadRequest_whenAlreadyDeclined() {
        User user = user("eve");
        WorkflowParticipant participant = pendingParticipant(user);
        participant.setStatus(ParticipantStatus.DECLINED);
        sessionWithParticipant("s5", participant);

        SignDocumentRequest req = new SignDocumentRequest();
        req.setCertType("SERVER");

        assertThatThrownBy(() -> service.signDocument("s5", user, req))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        verify(workflowParticipantRepository, never()).save(any());
    }

    @Test
    void signDocument_throwsForbidden_whenUserIsNotParticipant() {
        User owner = user("frank");
        owner.setId(1L);
        User intruder = user("intruder");
        intruder.setId(2L);
        WorkflowParticipant participant = pendingParticipant(owner);
        sessionWithParticipant("s6", participant);

        SignDocumentRequest req = new SignDocumentRequest();
        req.setCertType("SERVER");

        assertThatThrownBy(() -> service.signDocument("s6", intruder, req))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);

        verify(workflowParticipantRepository, never()).save(any());
    }
}
