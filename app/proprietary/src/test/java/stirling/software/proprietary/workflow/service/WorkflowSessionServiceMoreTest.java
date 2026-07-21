package stirling.software.proprietary.workflow.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Storage;
import stirling.software.common.model.ApplicationProperties.Storage.Signing;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.workflow.dto.ParticipantRequest;
import stirling.software.proprietary.workflow.dto.SignRequestDetailDTO;
import stirling.software.proprietary.workflow.dto.SignRequestSummaryDTO;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.model.WorkflowStatus;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;
import stirling.software.proprietary.workflow.repository.WorkflowSessionRepository;

import tools.jackson.databind.ObjectMapper;

// Covers session lifecycle, participant management and sign-request branches not in
// WorkflowSessionServiceTest.
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class WorkflowSessionServiceMoreTest {

    @Mock private WorkflowSessionRepository workflowSessionRepository;
    @Mock private WorkflowParticipantRepository workflowParticipantRepository;

    @Mock
    private stirling.software.proprietary.storage.repository.StoredFileRepository
            storedFileRepository;

    @Mock private UserRepository userRepository;
    @Mock private StorageProvider storageProvider;
    @Mock private ObjectMapper objectMapper;
    @Mock private ApplicationProperties applicationProperties;
    @Mock private MetadataEncryptionService metadataEncryptionService;
    @Mock private CertificateSubmissionValidator certificateSubmissionValidator;

    @InjectMocks private WorkflowSessionService service;

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private User user(String username, long id) {
        User u = new User();
        u.setUsername(username);
        u.setId(id);
        return u;
    }

    private WorkflowSession session(String id, User owner) {
        WorkflowSession s = new WorkflowSession();
        s.setSessionId(id);
        s.setOwner(owner);
        s.setDocumentName("doc.pdf");
        s.setParticipants(new ArrayList<>());
        return s;
    }

    private WorkflowParticipant participant(User user, ParticipantStatus status) {
        WorkflowParticipant p = new WorkflowParticipant();
        p.setUser(user);
        p.setStatus(status);
        return p;
    }

    // -------------------------------------------------------------------------
    // ensureSigningEnabled
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("ensureSigningEnabled")
    class EnsureSigningEnabled {

        @Test
        void storageDisabled_throwsForbidden() {
            Storage storage = mock(Storage.class);
            when(applicationProperties.getStorage()).thenReturn(storage);
            when(storage.isEnabled()).thenReturn(false);

            assertThatThrownBy(() -> service.ensureSigningEnabled())
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.FORBIDDEN);
        }

        @Test
        void signingDisabled_throwsForbidden() {
            Storage storage = mock(Storage.class);
            Signing signing = mock(Signing.class);
            when(applicationProperties.getStorage()).thenReturn(storage);
            when(storage.isEnabled()).thenReturn(true);
            when(storage.getSigning()).thenReturn(signing);
            when(signing.isEnabled()).thenReturn(false);

            assertThatThrownBy(() -> service.ensureSigningEnabled())
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.FORBIDDEN);
        }

        @Test
        void allEnabled_doesNotThrow() {
            Storage storage = mock(Storage.class);
            Signing signing = mock(Signing.class);
            when(applicationProperties.getStorage()).thenReturn(storage);
            when(storage.isEnabled()).thenReturn(true);
            when(storage.getSigning()).thenReturn(signing);
            when(signing.isEnabled()).thenReturn(true);

            service.ensureSigningEnabled();
        }
    }

    // -------------------------------------------------------------------------
    // getSession / getSessionWithParticipants
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("getSession lookups")
    class GetSessionLookups {

        @Test
        void getSession_found_returnsSession() {
            User owner = user("alice", 1L);
            WorkflowSession s = session("s1", owner);
            when(workflowSessionRepository.findBySessionId("s1")).thenReturn(Optional.of(s));

            assertThat(service.getSession("s1")).isSameAs(s);
        }

        @Test
        void getSession_notFound_throwsNotFound() {
            when(workflowSessionRepository.findBySessionId("x")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.getSession("x"))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }

        @Test
        void getSessionWithParticipants_notFound_throwsNotFound() {
            when(workflowSessionRepository.findBySessionIdWithParticipants("x"))
                    .thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.getSessionWithParticipants("x"))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }

        @Test
        void getSessionWithParticipantsForOwner_wrongOwner_throwsForbidden() {
            User owner = user("alice", 1L);
            User intruder = user("bob", 2L);
            WorkflowSession s = session("s2", owner);
            when(workflowSessionRepository.findBySessionIdWithParticipants("s2"))
                    .thenReturn(Optional.of(s));

            assertThatThrownBy(() -> service.getSessionWithParticipantsForOwner("s2", intruder))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.FORBIDDEN);
        }
    }

    // -------------------------------------------------------------------------
    // listActiveSessions
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("listActiveSessions delegates to repository")
    void listActiveSessions_delegates() {
        User owner = user("alice", 1L);
        WorkflowSession s = session("s1", owner);
        when(workflowSessionRepository.findActiveSessionsByOwner(owner)).thenReturn(List.of(s));

        assertThat(service.listActiveSessions(owner)).containsExactly(s);
    }

    // -------------------------------------------------------------------------
    // addParticipants
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("addParticipants")
    class AddParticipants {

        @Test
        void inactiveSession_throwsBadRequest() {
            User owner = user("alice", 1L);
            WorkflowSession s = session("s1", owner);
            s.setFinalized(true); // makes isActive() false
            when(workflowSessionRepository.findBySessionId("s1")).thenReturn(Optional.of(s));

            ParticipantRequest pr = new ParticipantRequest();
            pr.setEmail("p@example.com");

            assertThatThrownBy(() -> service.addParticipants("s1", List.of(pr), owner))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        void activeSession_emailParticipant_savesParticipant() {
            User owner = user("alice", 1L);
            WorkflowSession s = session("s1", owner);
            s.setStatus(WorkflowStatus.IN_PROGRESS);
            when(workflowSessionRepository.findBySessionId("s1")).thenReturn(Optional.of(s));
            when(workflowParticipantRepository.save(any())).thenAnswer(i -> i.getArgument(0));

            ParticipantRequest pr = new ParticipantRequest();
            pr.setEmail("p@example.com");
            pr.setName("Pat");

            service.addParticipants("s1", List.of(pr), owner);

            verify(workflowParticipantRepository).save(any(WorkflowParticipant.class));
            assertThat(s.getParticipants()).hasSize(1);
            assertThat(s.getParticipants().get(0).getEmail()).isEqualTo("p@example.com");
        }

        @Test
        void participantWithoutUserIdOrEmail_throwsBadRequest() {
            User owner = user("alice", 1L);
            WorkflowSession s = session("s1", owner);
            s.setStatus(WorkflowStatus.IN_PROGRESS);
            when(workflowSessionRepository.findBySessionId("s1")).thenReturn(Optional.of(s));

            ParticipantRequest pr = new ParticipantRequest(); // neither userId nor email

            assertThatThrownBy(() -> service.addParticipants("s1", List.of(pr), owner))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        void participantWithUnknownUserId_throwsNotFound() {
            User owner = user("alice", 1L);
            WorkflowSession s = session("s1", owner);
            s.setStatus(WorkflowStatus.IN_PROGRESS);
            when(workflowSessionRepository.findBySessionId("s1")).thenReturn(Optional.of(s));
            when(userRepository.findById(99L)).thenReturn(Optional.empty());

            ParticipantRequest pr = new ParticipantRequest();
            pr.setUserId(99L);

            assertThatThrownBy(() -> service.addParticipants("s1", List.of(pr), owner))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }
    }

    // -------------------------------------------------------------------------
    // removeParticipant
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("removeParticipant")
    class RemoveParticipant {

        @Test
        void participantNotFound_throwsNotFound() {
            User owner = user("alice", 1L);
            WorkflowSession s = session("s1", owner);
            when(workflowSessionRepository.findBySessionId("s1")).thenReturn(Optional.of(s));
            when(workflowParticipantRepository.findById(5L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.removeParticipant("s1", 5L, owner))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }

        @Test
        void participantInOtherSession_throwsBadRequest() {
            User owner = user("alice", 1L);
            WorkflowSession s = session("s1", owner);
            WorkflowSession other = session("s2", owner);
            when(workflowSessionRepository.findBySessionId("s1")).thenReturn(Optional.of(s));
            WorkflowParticipant p = participant(user("p", 9L), ParticipantStatus.PENDING);
            p.setWorkflowSession(other);
            when(workflowParticipantRepository.findById(5L)).thenReturn(Optional.of(p));

            assertThatThrownBy(() -> service.removeParticipant("s1", 5L, owner))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        void validParticipant_removedAndDeleted() {
            User owner = user("alice", 1L);
            WorkflowSession s = session("s1", owner);
            WorkflowParticipant p = participant(user("p", 9L), ParticipantStatus.PENDING);
            s.addParticipant(p);
            when(workflowSessionRepository.findBySessionId("s1")).thenReturn(Optional.of(s));
            when(workflowParticipantRepository.findById(5L)).thenReturn(Optional.of(p));

            service.removeParticipant("s1", 5L, owner);

            verify(workflowParticipantRepository).delete(p);
            assertThat(s.getParticipants()).isEmpty();
        }
    }

    // -------------------------------------------------------------------------
    // updateParticipantStatus / addParticipantNotification
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("participant status and notifications")
    class StatusAndNotifications {

        @Test
        void updateParticipantStatus_notFound_throwsNotFound() {
            when(workflowParticipantRepository.findById(1L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.updateParticipantStatus(1L, ParticipantStatus.VIEWED))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }

        @Test
        void updateParticipantStatus_found_updatesAndSaves() {
            WorkflowParticipant p = participant(user("p", 1L), ParticipantStatus.PENDING);
            when(workflowParticipantRepository.findById(1L)).thenReturn(Optional.of(p));

            service.updateParticipantStatus(1L, ParticipantStatus.VIEWED);

            assertThat(p.getStatus()).isEqualTo(ParticipantStatus.VIEWED);
            verify(workflowParticipantRepository).save(p);
        }

        @Test
        void addParticipantNotification_appendsTimestampedMessage() {
            WorkflowParticipant p = participant(user("p", 1L), ParticipantStatus.PENDING);
            when(workflowParticipantRepository.findById(1L)).thenReturn(Optional.of(p));

            service.addParticipantNotification(1L, "Hello");

            assertThat(p.getNotifications()).hasSize(1);
            assertThat(p.getNotifications().get(0)).endsWith(": Hello");
            verify(workflowParticipantRepository).save(p);
        }

        @Test
        void addParticipantNotification_notFound_throwsNotFound() {
            when(workflowParticipantRepository.findById(2L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.addParticipantNotification(2L, "x"))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }
    }

    // -------------------------------------------------------------------------
    // finalizeSession
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("finalizeSession")
    class FinalizeSession {

        @Test
        void alreadyFinalized_throwsBadRequest() {
            User owner = user("alice", 1L);
            WorkflowSession s = session("s1", owner);
            s.setFinalized(true);
            when(workflowSessionRepository.findBySessionId("s1")).thenReturn(Optional.of(s));

            assertThatThrownBy(() -> service.finalizeSession("s1", owner))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        void notYetFinalized_marksCompleted() {
            User owner = user("alice", 1L);
            WorkflowSession s = session("s1", owner);
            when(workflowSessionRepository.findBySessionId("s1")).thenReturn(Optional.of(s));

            service.finalizeSession("s1", owner);

            assertThat(s.isFinalized()).isTrue();
            assertThat(s.getStatus()).isEqualTo(WorkflowStatus.COMPLETED);
            verify(workflowSessionRepository).save(s);
        }
    }

    // -------------------------------------------------------------------------
    // getProcessedFile / getOriginalFile
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("file retrieval")
    class FileRetrieval {

        @Test
        void getProcessedFile_noProcessedFile_throwsNotFound() {
            User owner = user("alice", 1L);
            WorkflowSession s = session("s1", owner);
            when(workflowSessionRepository.findBySessionId("s1")).thenReturn(Optional.of(s));

            assertThatThrownBy(() -> service.getProcessedFile("s1", owner))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }

        @Test
        void getProcessedFile_present_returnsBytes() throws IOException {
            User owner = user("alice", 1L);
            WorkflowSession s = session("s1", owner);
            StoredFile pf = new StoredFile();
            pf.setStorageKey("proc-key");
            s.setProcessedFile(pf);
            when(workflowSessionRepository.findBySessionId("s1")).thenReturn(Optional.of(s));
            Resource resource = new ByteArrayResource(new byte[] {1, 2, 3});
            when(storageProvider.load("proc-key")).thenReturn(resource);

            assertThat(service.getProcessedFile("s1", owner)).containsExactly(1, 2, 3);
        }

        @Test
        void getOriginalFile_noOriginalFile_throwsNotFound() {
            User owner = user("alice", 1L);
            WorkflowSession s = session("s1", owner);
            when(workflowSessionRepository.findBySessionId("s1")).thenReturn(Optional.of(s));

            assertThatThrownBy(() -> service.getOriginalFile("s1"))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }

        @Test
        void getOriginalFile_present_returnsBytes() throws IOException {
            User owner = user("alice", 1L);
            WorkflowSession s = session("s1", owner);
            StoredFile of = new StoredFile();
            of.setStorageKey("orig-key");
            s.setOriginalFile(of);
            when(workflowSessionRepository.findBySessionId("s1")).thenReturn(Optional.of(s));
            Resource resource = new ByteArrayResource(new byte[] {7});
            when(storageProvider.load("orig-key")).thenReturn(resource);

            assertThat(service.getOriginalFile("s1")).containsExactly(7);
        }
    }

    // -------------------------------------------------------------------------
    // listSignRequests / getSignRequestDetail / getSignRequestDocument
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("sign request views")
    class SignRequestViews {

        @Test
        void listSignRequests_mapsParticipationsToSummaries() {
            User user = user("alice", 1L);
            User owner = user("owner", 2L);
            WorkflowSession s = session("s1", owner);
            s.setCreatedAt(LocalDateTime.now());
            WorkflowParticipant p = participant(user, ParticipantStatus.NOTIFIED);
            p.setWorkflowSession(s);
            when(workflowParticipantRepository.findByUserOrderByLastUpdatedDesc(user))
                    .thenReturn(List.of(p));

            List<SignRequestSummaryDTO> result = service.listSignRequests(user);

            assertThat(result).hasSize(1);
            assertThat(result.get(0).getSessionId()).isEqualTo("s1");
            assertThat(result.get(0).getOwnerUsername()).isEqualTo("owner");
            assertThat(result.get(0).getMyStatus()).isEqualTo(ParticipantStatus.NOTIFIED);
        }

        @Test
        void getSignRequestDetail_notifiedParticipant_transitionsToViewed() {
            User user = user("alice", 1L);
            User owner = user("owner", 2L);
            WorkflowSession s = session("s1", owner);
            s.setCreatedAt(LocalDateTime.now());
            WorkflowParticipant p = participant(user, ParticipantStatus.NOTIFIED);
            s.addParticipant(p);
            when(workflowSessionRepository.findBySessionId("s1")).thenReturn(Optional.of(s));

            SignRequestDetailDTO dto = service.getSignRequestDetail("s1", user);

            assertThat(dto.getMyStatus()).isEqualTo(ParticipantStatus.NOTIFIED);
            assertThat(p.getStatus()).isEqualTo(ParticipantStatus.VIEWED);
            verify(workflowParticipantRepository).save(p);
        }

        @Test
        void getSignRequestDetail_readsAppearanceFromMetadata() {
            User user = user("alice", 1L);
            User owner = user("owner", 2L);
            WorkflowSession s = session("s1", owner);
            s.setCreatedAt(LocalDateTime.now());
            Map<String, Object> meta = new HashMap<>();
            meta.put("showSignature", true);
            meta.put("pageNumber", 3);
            meta.put("reason", "Approval");
            s.setWorkflowMetadata(meta);
            WorkflowParticipant p = participant(user, ParticipantStatus.VIEWED);
            s.addParticipant(p);
            when(workflowSessionRepository.findBySessionId("s1")).thenReturn(Optional.of(s));

            SignRequestDetailDTO dto = service.getSignRequestDetail("s1", user);

            assertThat(dto.getShowSignature()).isTrue();
            assertThat(dto.getPageNumber()).isEqualTo(3);
            assertThat(dto.getReason()).isEqualTo("Approval");
        }

        @Test
        void getSignRequestDetail_userNotParticipant_throwsForbidden() {
            User intruder = user("intruder", 3L);
            User owner = user("owner", 2L);
            WorkflowSession s = session("s1", owner);
            when(workflowSessionRepository.findBySessionId("s1")).thenReturn(Optional.of(s));

            assertThatThrownBy(() -> service.getSignRequestDetail("s1", intruder))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.FORBIDDEN);
        }

        @Test
        void getSignRequestDocument_servesOriginalBeforeFinalize() throws IOException {
            User user = user("alice", 1L);
            User owner = user("owner", 2L);
            WorkflowSession s = session("s1", owner);
            StoredFile of = new StoredFile();
            of.setStorageKey("orig-key");
            s.setOriginalFile(of);
            WorkflowParticipant p = participant(user, ParticipantStatus.PENDING);
            s.addParticipant(p);
            when(workflowSessionRepository.findBySessionId("s1")).thenReturn(Optional.of(s));
            when(storageProvider.load("orig-key"))
                    .thenReturn(new ByteArrayResource(new byte[] {5}));

            assertThat(service.getSignRequestDocument("s1", user)).containsExactly(5);
        }

        @Test
        void getSignRequestDocument_noFile_throwsNotFound() {
            User user = user("alice", 1L);
            User owner = user("owner", 2L);
            WorkflowSession s = session("s1", owner);
            WorkflowParticipant p = participant(user, ParticipantStatus.PENDING);
            s.addParticipant(p);
            when(workflowSessionRepository.findBySessionId("s1")).thenReturn(Optional.of(s));

            assertThatThrownBy(() -> service.getSignRequestDocument("s1", user))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }
    }

    // -------------------------------------------------------------------------
    // declineSignRequest
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("declineSignRequest")
    class DeclineSignRequest {

        @Test
        void alreadySigned_throwsBadRequest() {
            User user = user("alice", 1L);
            User owner = user("owner", 2L);
            WorkflowSession s = session("s1", owner);
            WorkflowParticipant p = participant(user, ParticipantStatus.SIGNED);
            s.addParticipant(p);
            when(workflowSessionRepository.findBySessionId("s1")).thenReturn(Optional.of(s));

            assertThatThrownBy(() -> service.declineSignRequest("s1", user))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);

            verify(workflowParticipantRepository, never()).save(any());
        }

        @Test
        void pendingParticipant_setsDeclined() {
            User user = user("alice", 1L);
            User owner = user("owner", 2L);
            WorkflowSession s = session("s1", owner);
            WorkflowParticipant p = participant(user, ParticipantStatus.PENDING);
            s.addParticipant(p);
            when(workflowSessionRepository.findBySessionId("s1")).thenReturn(Optional.of(s));

            service.declineSignRequest("s1", user);

            assertThat(p.getStatus()).isEqualTo(ParticipantStatus.DECLINED);
            verify(workflowParticipantRepository).save(p);
        }
    }

    // -------------------------------------------------------------------------
    // deleteOriginalFile
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("deleteOriginalFile")
    class DeleteOriginalFile {

        @Test
        void noOriginalFile_noOp() {
            WorkflowSession s = session("s1", user("alice", 1L));

            service.deleteOriginalFile(s);

            verify(storedFileRepository, never()).delete(any());
        }

        @Test
        void withOriginalFile_deletesAndNullsReference() throws IOException {
            WorkflowSession s = session("s1", user("alice", 1L));
            StoredFile of = new StoredFile();
            of.setStorageKey("orig-key");
            s.setOriginalFile(of);

            service.deleteOriginalFile(s);

            assertThat(s.getOriginalFile()).isNull();
            verify(storageProvider).delete("orig-key");
            verify(storedFileRepository).delete(of);
            verify(workflowSessionRepository).save(s);
        }

        @Test
        void storageError_nonFatal_keepsReference() throws IOException {
            WorkflowSession s = session("s1", user("alice", 1L));
            StoredFile of = new StoredFile();
            of.setStorageKey("orig-key");
            s.setOriginalFile(of);
            org.mockito.Mockito.doThrow(new RuntimeException("boom"))
                    .when(storageProvider)
                    .delete("orig-key");

            service.deleteOriginalFile(s);

            // delete threw before nulling — reference still present, no DB delete
            verify(storedFileRepository, never()).delete(any());
        }
    }
}
