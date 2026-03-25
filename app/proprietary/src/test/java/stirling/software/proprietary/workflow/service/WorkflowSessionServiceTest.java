package stirling.software.proprietary.workflow.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Storage;
import stirling.software.common.model.ApplicationProperties.Storage.Signing;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.provider.StoredObject;
import stirling.software.proprietary.storage.repository.StoredFileRepository;
import stirling.software.proprietary.workflow.dto.SignDocumentRequest;
import stirling.software.proprietary.workflow.dto.WorkflowCreationRequest;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.model.WorkflowStatus;
import stirling.software.proprietary.workflow.model.WorkflowType;
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

    // -------------------------------------------------------------------------
    // createSession — validation guards
    // -------------------------------------------------------------------------

    private void stubSigningEnabled() {
        Storage storage = mock(Storage.class);
        Signing signing = mock(Signing.class);
        when(applicationProperties.getStorage()).thenReturn(storage);
        when(storage.isEnabled()).thenReturn(true);
        when(storage.getSigning()).thenReturn(signing);
        when(signing.isEnabled()).thenReturn(true);
    }

    @Test
    void createSession_nullFile_throwsBadRequest() {
        WorkflowCreationRequest request = new WorkflowCreationRequest();
        request.setWorkflowType(WorkflowType.SIGNING);

        assertThatThrownBy(() -> service.createSession(user("owner"), null, request))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void createSession_emptyFile_throwsBadRequest() {
        MockMultipartFile empty =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[0]);
        WorkflowCreationRequest request = new WorkflowCreationRequest();
        request.setWorkflowType(WorkflowType.SIGNING);

        assertThatThrownBy(() -> service.createSession(user("owner"), empty, request))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void createSession_nullWorkflowType_throwsBadRequest() {
        MockMultipartFile file =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1});
        WorkflowCreationRequest request = new WorkflowCreationRequest();
        request.setWorkflowType(null);

        assertThatThrownBy(() -> service.createSession(user("owner"), file, request))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void createSession_validRequest_sessionSavedWithOwnerAndInProgressStatus() throws IOException {
        User owner = user("alice");
        MockMultipartFile file =
                new MockMultipartFile("file", "doc.pdf", "application/pdf", new byte[] {1, 2});
        WorkflowCreationRequest request = new WorkflowCreationRequest();
        request.setWorkflowType(WorkflowType.SIGNING);
        request.setDocumentName("My Doc");

        StoredObject storedObject =
                StoredObject.builder()
                        .storageKey("key-1")
                        .originalFilename("doc.pdf")
                        .contentType("application/pdf")
                        .sizeBytes(2L)
                        .build();
        when(storageProvider.store(any(), any())).thenReturn(storedObject);

        StoredFile savedFile = new StoredFile();
        when(storedFileRepository.save(any())).thenReturn(savedFile);

        WorkflowSession savedSession = new WorkflowSession();
        savedSession.setSessionId("s-abc");
        savedSession.setParticipants(new ArrayList<>());
        when(workflowSessionRepository.save(any())).thenReturn(savedSession);

        WorkflowSession result = service.createSession(owner, file, request);

        ArgumentCaptor<WorkflowSession> captor = ArgumentCaptor.forClass(WorkflowSession.class);
        verify(workflowSessionRepository).save(captor.capture());
        assertThat(captor.getValue().getOwner()).isEqualTo(owner);
        assertThat(captor.getValue().getStatus()).isEqualTo(WorkflowStatus.IN_PROGRESS);
        assertThat(result).isNotNull();
    }

    @Test
    void createSession_documentNameFromRequest() throws IOException {
        User owner = user("alice");
        MockMultipartFile file =
                new MockMultipartFile("file", "original.pdf", "application/pdf", new byte[] {1});
        WorkflowCreationRequest request = new WorkflowCreationRequest();
        request.setWorkflowType(WorkflowType.SIGNING);
        request.setDocumentName("Custom Name");

        when(storageProvider.store(any(), any()))
                .thenReturn(
                        StoredObject.builder()
                                .storageKey("k")
                                .originalFilename("original.pdf")
                                .contentType("application/pdf")
                                .sizeBytes(1L)
                                .build());
        when(storedFileRepository.save(any())).thenReturn(new StoredFile());

        WorkflowSession savedSession = new WorkflowSession();
        savedSession.setSessionId("s-1");
        savedSession.setParticipants(new ArrayList<>());
        when(workflowSessionRepository.save(any())).thenReturn(savedSession);

        service.createSession(owner, file, request);

        ArgumentCaptor<WorkflowSession> captor = ArgumentCaptor.forClass(WorkflowSession.class);
        verify(workflowSessionRepository).save(captor.capture());
        assertThat(captor.getValue().getDocumentName()).isEqualTo("Custom Name");
    }

    @Test
    void createSession_documentNameFallsBackToOriginalFilename() throws IOException {
        User owner = user("alice");
        MockMultipartFile file =
                new MockMultipartFile("file", "uploaded.pdf", "application/pdf", new byte[] {1});
        WorkflowCreationRequest request = new WorkflowCreationRequest();
        request.setWorkflowType(WorkflowType.SIGNING);
        request.setDocumentName(null);

        when(storageProvider.store(any(), any()))
                .thenReturn(
                        StoredObject.builder()
                                .storageKey("k")
                                .originalFilename("uploaded.pdf")
                                .contentType("application/pdf")
                                .sizeBytes(1L)
                                .build());
        when(storedFileRepository.save(any())).thenReturn(new StoredFile());

        WorkflowSession savedSession = new WorkflowSession();
        savedSession.setSessionId("s-2");
        savedSession.setParticipants(new ArrayList<>());
        when(workflowSessionRepository.save(any())).thenReturn(savedSession);

        service.createSession(owner, file, request);

        ArgumentCaptor<WorkflowSession> captor = ArgumentCaptor.forClass(WorkflowSession.class);
        verify(workflowSessionRepository).save(captor.capture());
        assertThat(captor.getValue().getDocumentName()).isEqualTo("uploaded.pdf");
    }

    // -------------------------------------------------------------------------
    // getSessionForOwner
    // -------------------------------------------------------------------------

    @Test
    void getSessionForOwner_ownerMatch_returnsSession() {
        User owner = user("alice");
        owner.setId(1L);
        WorkflowSession session = new WorkflowSession();
        session.setSessionId("s1");
        session.setOwner(owner);
        when(workflowSessionRepository.findBySessionId("s1")).thenReturn(Optional.of(session));

        WorkflowSession result = service.getSessionForOwner("s1", owner);

        assertThat(result).isSameAs(session);
    }

    @Test
    void getSessionForOwner_sessionNotFound_throwsNotFound() {
        when(workflowSessionRepository.findBySessionId("missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getSessionForOwner("missing", user("alice")))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void getSessionForOwner_wrongOwner_throwsForbidden() {
        User owner = user("alice");
        owner.setId(1L);
        User intruder = user("bob");
        intruder.setId(2L);

        WorkflowSession session = new WorkflowSession();
        session.setSessionId("s2");
        session.setOwner(owner);
        when(workflowSessionRepository.findBySessionId("s2")).thenReturn(Optional.of(session));

        assertThatThrownBy(() -> service.getSessionForOwner("s2", intruder))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    // -------------------------------------------------------------------------
    // deleteSession
    // -------------------------------------------------------------------------

    @Test
    void deleteSession_ownerAuthorized_deletesSession() {
        User owner = user("alice");
        owner.setId(1L);
        WorkflowSession session = new WorkflowSession();
        session.setSessionId("s3");
        session.setOwner(owner);
        when(workflowSessionRepository.findBySessionId("s3")).thenReturn(Optional.of(session));

        service.deleteSession("s3", owner);

        verify(workflowSessionRepository).delete(session);
        // session.save() must NOT be called — that would UPDATE original_file_id to NULL,
        // violating the NOT NULL constraint; the row is simply deleted instead
        verify(workflowSessionRepository, never()).save(any());
    }

    @Test
    void deleteSession_withBothFiles_nullsBackRefsAndDeletesInOrder() {
        User owner = user("alice");
        owner.setId(1L);

        StoredFile originalFile = new StoredFile();
        originalFile.setStorageKey("key-orig");
        StoredFile processedFile = new StoredFile();
        processedFile.setStorageKey("key-proc");

        WorkflowSession session = new WorkflowSession();
        session.setSessionId("s3b");
        session.setOwner(owner);
        session.setOriginalFile(originalFile);
        session.setProcessedFile(processedFile);
        when(workflowSessionRepository.findBySessionId("s3b")).thenReturn(Optional.of(session));

        service.deleteSession("s3b", owner);

        // Only the back-reference (StoredFile → session) must be nulled; session.originalFile
        // is NOT nulled because that would emit UPDATE original_file_id=NULL (NOT NULL violation)
        assertThat(originalFile.getWorkflowSession()).isNull();
        assertThat(processedFile.getWorkflowSession()).isNull();

        // Order: save StoredFiles (clear back-refs) → delete session → delete StoredFile rows
        InOrder inOrder = inOrder(workflowSessionRepository, storedFileRepository);
        inOrder.verify(storedFileRepository).save(originalFile);
        inOrder.verify(storedFileRepository).save(processedFile);
        inOrder.verify(workflowSessionRepository).delete(session);
        inOrder.verify(storedFileRepository).delete(originalFile);
        inOrder.verify(storedFileRepository).delete(processedFile);
    }

    @Test
    void deleteSession_finalizedSession_throwsBadRequest() {
        User owner = user("alice");
        owner.setId(1L);

        WorkflowSession session = new WorkflowSession();
        session.setSessionId("s3c");
        session.setOwner(owner);
        session.setFinalized(true);
        when(workflowSessionRepository.findBySessionId("s3c")).thenReturn(Optional.of(session));

        assertThatThrownBy(() -> service.deleteSession("s3c", owner))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        verify(workflowSessionRepository, never()).delete(any());
    }

    @Test
    void deleteSession_storageErrorOnOriginalFile_stillDeletesSession() throws Exception {
        User owner = user("alice");
        owner.setId(1L);

        StoredFile originalFile = new StoredFile();
        originalFile.setStorageKey("key-orig");

        WorkflowSession session = new WorkflowSession();
        session.setSessionId("s4");
        session.setOwner(owner);
        session.setOriginalFile(originalFile);
        when(workflowSessionRepository.findBySessionId("s4")).thenReturn(Optional.of(session));
        doThrow(new RuntimeException("storage unavailable"))
                .when(storageProvider)
                .delete("key-orig");

        service.deleteSession("s4", owner);

        // Storage failure is non-fatal — back-ref is still cleared and DB records still deleted
        verify(storedFileRepository).save(originalFile); // back-ref cleared
        verify(workflowSessionRepository).delete(session);
        verify(storedFileRepository).delete(originalFile);
    }

    @Test
    void deleteSession_notOwner_throwsForbidden() {
        User owner = user("alice");
        owner.setId(1L);
        User other = user("bob");
        other.setId(2L);

        WorkflowSession session = new WorkflowSession();
        session.setSessionId("s5");
        session.setOwner(owner);
        when(workflowSessionRepository.findBySessionId("s5")).thenReturn(Optional.of(session));

        assertThatThrownBy(() -> service.deleteSession("s5", other))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);

        verify(workflowSessionRepository, never()).delete(any());
    }

    // -------------------------------------------------------------------------
    // listUserSessions
    // -------------------------------------------------------------------------

    @Test
    void listUserSessions_returnsAllSessionsForOwner() {
        User owner = user("alice");
        WorkflowSession s1 = new WorkflowSession();
        WorkflowSession s2 = new WorkflowSession();
        when(workflowSessionRepository.findByOwnerOrderByCreatedAtDesc(owner))
                .thenReturn(List.of(s1, s2));

        List<WorkflowSession> result = service.listUserSessions(owner);

        assertThat(result).containsExactly(s1, s2);
    }

    @Test
    void listUserSessions_noSessions_returnsEmptyList() {
        User owner = user("alice");
        when(workflowSessionRepository.findByOwnerOrderByCreatedAtDesc(owner))
                .thenReturn(List.of());

        assertThat(service.listUserSessions(owner)).isEmpty();
    }
}
