package stirling.software.proprietary.workflow.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.repository.FileShareRepository;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.model.WorkflowStatus;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;
import stirling.software.proprietary.workflow.service.UnifiedAccessControlService.AccessValidationResult;

@ExtendWith(MockitoExtension.class)
class UnifiedAccessControlServiceTest {

    @Mock private FileShareRepository fileShareRepository;
    @Mock private WorkflowParticipantRepository workflowParticipantRepository;

    @InjectMocks private UnifiedAccessControlService service;

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private User user(long id) {
        User u = new User();
        u.setId(id);
        u.setUsername("user" + id);
        return u;
    }

    private FileShare share(StoredFile file, User sharedWith, LocalDateTime expiresAt) {
        FileShare s = new FileShare();
        s.setFile(file);
        s.setShareToken("tok-" + System.nanoTime());
        s.setAccessRole(ShareAccessRole.EDITOR);
        s.setSharedWithUser(sharedWith);
        s.setExpiresAt(expiresAt);
        return s;
    }

    private WorkflowParticipant participant(
            User user, ParticipantStatus status, boolean sessionActive, LocalDateTime expiresAt) {
        WorkflowSession session = new WorkflowSession();
        session.setStatus(sessionActive ? WorkflowStatus.IN_PROGRESS : WorkflowStatus.COMPLETED);
        session.setFinalized(false);

        StoredFile file = new StoredFile();
        session.setOriginalFile(file);

        WorkflowParticipant p = new WorkflowParticipant();
        p.setUser(user);
        p.setStatus(status);
        p.setAccessRole(ShareAccessRole.EDITOR);
        p.setExpiresAt(expiresAt);
        p.setWorkflowSession(session);
        return p;
    }

    // -------------------------------------------------------------------------
    // validateToken — file share branch
    // -------------------------------------------------------------------------

    @Test
    void validateToken_genericShare_noExpiry_noUserRestriction_allowed() {
        StoredFile file = new StoredFile();
        FileShare s = share(file, null, null);
        when(fileShareRepository.findByShareTokenWithFile("tok")).thenReturn(Optional.of(s));

        AccessValidationResult result = service.validateToken("tok", null);

        assertThat(result.isAllowed()).isTrue();
        assertThat(result.isWorkflowAccess()).isFalse();
    }

    @Test
    void validateToken_genericShare_expired_denied() {
        StoredFile file = new StoredFile();
        FileShare s = share(file, null, LocalDateTime.now().minusSeconds(1));
        when(fileShareRepository.findByShareTokenWithFile("tok")).thenReturn(Optional.of(s));

        AccessValidationResult result = service.validateToken("tok", null);

        assertThat(result.isAllowed()).isFalse();
        assertThat(result.getDenialReason()).containsIgnoringCase("expired");
    }

    @Test
    void validateToken_userSpecificShare_wrongUser_denied() {
        User owner = user(1L);
        User requester = user(2L);
        StoredFile file = new StoredFile();
        FileShare s = share(file, owner, null);
        when(fileShareRepository.findByShareTokenWithFile("tok")).thenReturn(Optional.of(s));

        AccessValidationResult result = service.validateToken("tok", requester);

        assertThat(result.isAllowed()).isFalse();
        assertThat(result.getDenialReason()).containsIgnoringCase("denied");
    }

    @Test
    void validateToken_userSpecificShare_correctUser_allowed() {
        User u = user(1L);
        StoredFile file = new StoredFile();
        FileShare s = share(file, u, null);
        when(fileShareRepository.findByShareTokenWithFile("tok")).thenReturn(Optional.of(s));

        AccessValidationResult result = service.validateToken("tok", u);

        assertThat(result.isAllowed()).isTrue();
    }

    // -------------------------------------------------------------------------
    // validateToken — workflow participant branch
    // -------------------------------------------------------------------------

    @Test
    void validateToken_participantToken_notFileShare_activeParticipant_allowed() {
        User u = user(1L);
        WorkflowParticipant p = participant(u, ParticipantStatus.PENDING, true, null);
        when(fileShareRepository.findByShareTokenWithFile("tok")).thenReturn(Optional.empty());
        when(workflowParticipantRepository.findByShareToken("tok")).thenReturn(Optional.of(p));

        AccessValidationResult result = service.validateToken("tok", u);

        assertThat(result.isAllowed()).isTrue();
        assertThat(result.isWorkflowAccess()).isTrue();
    }

    @Test
    void validateToken_participantToken_expired_denied() {
        User u = user(1L);
        WorkflowParticipant p =
                participant(
                        u, ParticipantStatus.PENDING, true, LocalDateTime.now().minusSeconds(1));
        when(fileShareRepository.findByShareTokenWithFile("tok")).thenReturn(Optional.empty());
        when(workflowParticipantRepository.findByShareToken("tok")).thenReturn(Optional.of(p));

        AccessValidationResult result = service.validateToken("tok", u);

        assertThat(result.isAllowed()).isFalse();
        assertThat(result.getDenialReason()).containsIgnoringCase("expired");
    }

    @Test
    void validateToken_participantToken_sessionInactive_denied() {
        User u = user(1L);
        WorkflowParticipant p = participant(u, ParticipantStatus.PENDING, false, null);
        when(fileShareRepository.findByShareTokenWithFile("tok")).thenReturn(Optional.empty());
        when(workflowParticipantRepository.findByShareToken("tok")).thenReturn(Optional.of(p));

        AccessValidationResult result = service.validateToken("tok", u);

        assertThat(result.isAllowed()).isFalse();
        assertThat(result.getDenialReason()).containsIgnoringCase("no longer active");
    }

    @Test
    void validateToken_participantToken_wrongUser_denied() {
        User owner = user(1L);
        User requester = user(2L);
        WorkflowParticipant p = participant(owner, ParticipantStatus.PENDING, true, null);
        when(fileShareRepository.findByShareTokenWithFile("tok")).thenReturn(Optional.empty());
        when(workflowParticipantRepository.findByShareToken("tok")).thenReturn(Optional.of(p));

        AccessValidationResult result = service.validateToken("tok", requester);

        assertThat(result.isAllowed()).isFalse();
    }

    @Test
    void validateToken_unknownToken_denied() {
        when(fileShareRepository.findByShareTokenWithFile("tok")).thenReturn(Optional.empty());
        when(workflowParticipantRepository.findByShareToken("tok")).thenReturn(Optional.empty());

        AccessValidationResult result = service.validateToken("tok", null);

        assertThat(result.isAllowed()).isFalse();
    }

    // -------------------------------------------------------------------------
    // getEffectiveRole
    // -------------------------------------------------------------------------

    @Test
    void getEffectiveRole_signed_returnsViewer() {
        WorkflowParticipant p = participant(null, ParticipantStatus.SIGNED, true, null);
        assertThat(service.getEffectiveRole(p)).isEqualTo(ShareAccessRole.VIEWER);
    }

    @Test
    void getEffectiveRole_declined_returnsViewer() {
        WorkflowParticipant p = participant(null, ParticipantStatus.DECLINED, true, null);
        assertThat(service.getEffectiveRole(p)).isEqualTo(ShareAccessRole.VIEWER);
    }

    @Test
    void getEffectiveRole_pending_returnsAssignedRole() {
        WorkflowParticipant p = participant(null, ParticipantStatus.PENDING, true, null);
        p.setAccessRole(ShareAccessRole.EDITOR);
        assertThat(service.getEffectiveRole(p)).isEqualTo(ShareAccessRole.EDITOR);
    }

    @Test
    void getEffectiveRole_notified_returnsAssignedRole() {
        WorkflowParticipant p = participant(null, ParticipantStatus.NOTIFIED, true, null);
        p.setAccessRole(ShareAccessRole.VIEWER);
        assertThat(service.getEffectiveRole(p)).isEqualTo(ShareAccessRole.VIEWER);
    }

    @Test
    void getEffectiveRole_viewed_returnsAssignedRole() {
        WorkflowParticipant p = participant(null, ParticipantStatus.VIEWED, true, null);
        p.setAccessRole(ShareAccessRole.COMMENTER);
        assertThat(service.getEffectiveRole(p)).isEqualTo(ShareAccessRole.COMMENTER);
    }

    // -------------------------------------------------------------------------
    // canAccessFile
    // -------------------------------------------------------------------------

    @Test
    void canAccessFile_owner_returnsTrue() {
        User u = user(1L);
        StoredFile file = new StoredFile();
        file.setOwner(u);

        assertThat(service.canAccessFile(u, file)).isTrue();
    }

    @Test
    void canAccessFile_nonOwner_withValidShare_returnsTrue() {
        User owner = user(1L);
        User requester = user(2L);
        StoredFile file = new StoredFile();
        file.setOwner(owner);

        FileShare s = share(file, requester, null);
        when(fileShareRepository.findByFileAndSharedWithUser(file, requester))
                .thenReturn(Optional.of(s));

        assertThat(service.canAccessFile(requester, file)).isTrue();
    }

    @Test
    void canAccessFile_nonOwner_withExpiredShare_returnsFalse() {
        User owner = user(1L);
        User requester = user(2L);
        StoredFile file = new StoredFile();
        file.setOwner(owner);

        FileShare s = share(file, requester, LocalDateTime.now().minusSeconds(1));
        when(fileShareRepository.findByFileAndSharedWithUser(file, requester))
                .thenReturn(Optional.of(s));

        assertThat(service.canAccessFile(requester, file)).isFalse();
    }

    @Test
    void canAccessFile_nonOwner_noShare_returnsFalse() {
        User owner = user(1L);
        User requester = user(2L);
        StoredFile file = new StoredFile();
        file.setOwner(owner);

        when(fileShareRepository.findByFileAndSharedWithUser(file, requester))
                .thenReturn(Optional.empty());

        assertThat(service.canAccessFile(requester, file)).isFalse();
    }

    @Test
    void canAccessFile_workflowParticipant_activeSession_returnsTrue() {
        User owner = user(1L);
        User requester = user(2L);

        WorkflowSession session = new WorkflowSession();
        session.setStatus(WorkflowStatus.IN_PROGRESS);
        session.setFinalized(false);

        StoredFile file = new StoredFile();
        file.setOwner(owner);
        file.setWorkflowSession(session);

        WorkflowParticipant p = participant(requester, ParticipantStatus.PENDING, true, null);

        when(fileShareRepository.findByFileAndSharedWithUser(file, requester))
                .thenReturn(Optional.empty());
        when(workflowParticipantRepository.findByWorkflowSessionAndUser(session, requester))
                .thenReturn(Optional.of(p));

        assertThat(service.canAccessFile(requester, file)).isTrue();
    }

    @Test
    void canAccessFile_workflowParticipant_expiredParticipant_returnsFalse() {
        User owner = user(1L);
        User requester = user(2L);

        WorkflowSession session = new WorkflowSession();
        session.setStatus(WorkflowStatus.IN_PROGRESS);
        session.setFinalized(false);

        StoredFile file = new StoredFile();
        file.setOwner(owner);
        file.setWorkflowSession(session);

        WorkflowParticipant p =
                participant(
                        requester,
                        ParticipantStatus.PENDING,
                        true,
                        LocalDateTime.now().minusSeconds(1));

        when(fileShareRepository.findByFileAndSharedWithUser(file, requester))
                .thenReturn(Optional.empty());
        when(workflowParticipantRepository.findByWorkflowSessionAndUser(session, requester))
                .thenReturn(Optional.of(p));

        assertThat(service.canAccessFile(requester, file)).isFalse();
    }
}
